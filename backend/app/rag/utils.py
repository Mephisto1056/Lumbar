import asyncio
import copy
import uuid
from app.db.milvus import milvus_client
from app.db.mongo import get_mongo
from app.rag.convert_file import convert_file_to_images, save_image_to_minio
from app.rag.get_embedding import get_embeddings_from_httpx, get_audio_embeddings, get_video_embeddings, get_image_embeddings, get_text_embeddings
from app.rag.convert_media import media_converter, process_media_file
from app.db.miniodb import async_minio_manager
from app.core.logging import logger


def sort_and_filter(data, min_score=None, max_score=None):
    # 筛选
    if min_score is not None:
        data = [item for item in data if item["score"] >= min_score]
    if max_score is not None:
        data = [item for item in data if item["score"] <= max_score]
    # 排序
    sorted_data = sorted(data, key=lambda x: x["score"], reverse=True)
    return sorted_data


async def update_task_progress(redis, task_id, status, message):
    await redis.hset(f"task:{task_id}", mapping={"status": status, "message": message})


async def handle_processing_error(redis, task_id, error_msg):
    await redis.hset(
        f"task:{task_id}", mapping={"status": "failed", "message": error_msg}
    )


async def process_file(redis, task_id, username, knowledge_db_id, file_meta):
    try:
        # 从MinIO获取文件内容
        file_content = await async_minio_manager.get_file_from_minio(
            file_meta["minio_filename"]
        )

        db = await get_mongo()
        filename = file_meta["original_filename"]
        
        # 检测文件媒体类型
        media_type = media_converter.detect_media_type(filename)
        logger.info(f"task:{task_id}: Processing {filename} as {media_type} file")

        if media_type == 'audio':
            await process_audio_file(redis, task_id, username, knowledge_db_id, file_meta, file_content, db)
        elif media_type == 'video':
            await process_video_file(redis, task_id, username, knowledge_db_id, file_meta, file_content, db)
        elif media_type == 'image':
            await process_image_file(redis, task_id, username, knowledge_db_id, file_meta, file_content, db)
        else:
            # 传统文档处理方式
            await process_document_file(redis, task_id, username, knowledge_db_id, file_meta, file_content, db)

        # 更新处理进度
        await redis.hincrby(f"task:{task_id}", "processed", 1)
        current = int(await redis.hget(f"task:{task_id}", "processed"))
        total = int(await redis.hget(f"task:{task_id}", "total"))
        logger.info(f"task:{task_id} files processed + 1!")

        if current == total:
            await redis.hset(f"task:{task_id}", "status", "completed")
            await redis.hset(
                f"task:{task_id}", "message", "All files processed successfully"
            )
            logger.info(f"task:{task_id} All files processed successfully")

    except Exception as e:
        await handle_processing_error(
            redis, task_id, f"File processing failed: {str(e)}"
        )
        raise


async def process_audio_file(redis, task_id, username, knowledge_db_id, file_meta, file_content, db):
    """处理音频文件"""
    filename = file_meta["original_filename"]
    
    # 处理音频文件元数据
    media_result = await process_media_file(file_content, filename)
    if not media_result['success']:
        raise Exception(f"Audio processing failed: {media_result.get('error', 'Unknown error')}")

    # 获取音频嵌入
    embeddings_result = await get_audio_embeddings([file_content])
    
    # 创建文件记录（包含媒体元数据）
    await db.create_files(
        file_id=file_meta["file_id"],
        username=username,
        filename=filename,
        minio_filename=file_meta["minio_filename"],
        minio_url=file_meta["minio_url"],
        knowledge_db_id=knowledge_db_id,
        media_type='audio',
        media_metadata=media_result['metadata']
    )
    
    # 添加到知识库
    await db.knowledge_base_add_file(
        knowledge_base_id=knowledge_db_id,
        file_id=file_meta["file_id"],
        original_filename=filename,
        minio_filename=file_meta["minio_filename"],
        minio_url=file_meta["minio_url"],
    )

    # 保存音频分段嵌入
    if embeddings_result and len(embeddings_result) > 0:
        collection_name = f"colqwen{knowledge_db_id.replace('-', '_')}"
        
        for result in embeddings_result:
            if 'segments' in result:
                # 存储到MongoDB
                await db.add_media_segments(
                    file_id=file_meta["file_id"],
                    segments=result['segments']
                )
                
                # 存储到Milvus向量数据库
                segments = result['segments']
                embeddings = [seg['embedding'] for seg in segments if 'embedding' in seg]
                segment_ids = [seg['segment_id'] for seg in segments if 'segment_id' in seg]
                
                if embeddings and segment_ids:
                    await insert_media_to_milvus(
                        collection_name,
                        embeddings,
                        segment_ids,
                        file_meta["file_id"],
                        segments,
                        'audio'
                    )

    logger.info(f"task:{task_id}: Audio file {filename} processed successfully")


async def process_video_file(redis, task_id, username, knowledge_db_id, file_meta, file_content, db):
    """处理视频文件"""
    filename = file_meta["original_filename"]
    
    # 处理视频文件元数据
    media_result = await process_media_file(file_content, filename)
    if not media_result['success']:
        raise Exception(f"Video processing failed: {media_result.get('error', 'Unknown error')}")

    # 获取视频嵌入
    embeddings_result = await get_video_embeddings([file_content])
    
    # 创建文件记录（包含媒体元数据）
    await db.create_files(
        file_id=file_meta["file_id"],
        username=username,
        filename=filename,
        minio_filename=file_meta["minio_filename"],
        minio_url=file_meta["minio_url"],
        knowledge_db_id=knowledge_db_id,
        media_type='video',
        media_metadata=media_result['metadata']
    )
    
    # 添加到知识库
    await db.knowledge_base_add_file(
        knowledge_base_id=knowledge_db_id,
        file_id=file_meta["file_id"],
        original_filename=filename,
        minio_filename=file_meta["minio_filename"],
        minio_url=file_meta["minio_url"],
    )

    # 保存视频帧和音频分段嵌入
    if embeddings_result and len(embeddings_result) > 0:
        collection_name = f"colqwen{knowledge_db_id.replace('-', '_')}"
        
        for result in embeddings_result:
            # 处理视频帧
            if 'frames' in result:
                frames = result['frames']
                
                # 处理帧缩略图
                processed_frames = []
                for frame in frames:
                    processed_frame = frame.copy()
                    
                    # 如果有缩略图数据，保存到MinIO
                    if 'thumbnail_base64' in frame and frame['thumbnail_base64']:
                        try:
                            import base64
                            import io
                            
                            # 解码base64图片并转换为BytesIO
                            thumbnail_data = base64.b64decode(frame['thumbnail_base64'])
                            thumbnail_buffer = io.BytesIO(thumbnail_data)
                            
                            # 保存到MinIO（传递BytesIO对象）
                            thumbnail_minio_name, thumbnail_url = await save_image_to_minio(
                                username, f"frame_{frame['frame_id']}", thumbnail_buffer
                            )
                            
                            # 添加缩略图信息到帧数据
                            processed_frame.update({
                                'frame_image_filename': thumbnail_minio_name,
                                'frame_image_url': thumbnail_url
                            })
                            
                        except Exception as e:
                            logger.warning(f"Failed to save frame thumbnail: {e}")
                    
                    # 清理base64数据以节省存储空间
                    if 'thumbnail_base64' in processed_frame:
                        del processed_frame['thumbnail_base64']
                    
                    processed_frames.append(processed_frame)
                
                await db.add_media_segments(
                    file_id=file_meta["file_id"],
                    segments=processed_frames
                )
                
                # 存储帧embeddings到Milvus
                frame_embeddings = [frame['embedding'] for frame in processed_frames if 'embedding' in frame]
                frame_ids = [frame['frame_id'] for frame in processed_frames if 'frame_id' in frame]
                
                if frame_embeddings and frame_ids:
                    await insert_media_to_milvus(
                        collection_name,
                        frame_embeddings,
                        frame_ids,
                        file_meta["file_id"],
                        processed_frames,
                        'video_frame'
                    )
            
            # 处理音频分段
            if 'audio_segments' in result:
                audio_segments = result['audio_segments']
                await db.add_media_segments(
                    file_id=file_meta["file_id"],
                    segments=audio_segments
                )
                
                # 存储音频embeddings到Milvus
                audio_embeddings = [seg['embedding'] for seg in audio_segments if 'embedding' in seg]
                audio_ids = [seg['segment_id'] for seg in audio_segments if 'segment_id' in seg]
                
                if audio_embeddings and audio_ids:
                    await insert_media_to_milvus(
                        collection_name,
                        audio_embeddings,
                        audio_ids,
                        file_meta["file_id"],
                        audio_segments,
                        'video_audio'
                    )

    logger.info(f"task:{task_id}: Video file {filename} processed successfully")


async def process_image_file(redis, task_id, username, knowledge_db_id, file_meta, file_content, db):
    """处理图像文件"""
    filename = file_meta["original_filename"]
    
    # 获取图像嵌入
    embeddings = await get_image_embeddings([file_content])
    
    # 创建文件记录
    await db.create_files(
        file_id=file_meta["file_id"],
        username=username,
        filename=filename,
        minio_filename=file_meta["minio_filename"],
        minio_url=file_meta["minio_url"],
        knowledge_db_id=knowledge_db_id,
        media_type='image'
    )
    
    # 添加到知识库
    await db.knowledge_base_add_file(
        knowledge_base_id=knowledge_db_id,
        file_id=file_meta["file_id"],
        original_filename=filename,
        minio_filename=file_meta["minio_filename"],
        minio_url=file_meta["minio_url"],
    )

    # 插入Milvus
    if embeddings:
        collection_name = f"colqwen{knowledge_db_id.replace('-', '_')}"
        image_id = f"{username}_{uuid.uuid4()}"
        await insert_to_milvus(
            collection_name, [embeddings[0]], [image_id], file_meta["file_id"]
        )
        
        # 保存图像元数据
        await db.add_images(
            file_id=file_meta["file_id"],
            images_id=image_id,
            minio_filename=file_meta["minio_filename"],
            minio_url=file_meta["minio_url"],
            page_number=1,
        )

    logger.info(f"task:{task_id}: Image file {filename} processed successfully")


async def process_document_file(redis, task_id, username, knowledge_db_id, file_meta, file_content, db):
    """处理文档文件（原有逻辑）"""
    filename = file_meta["original_filename"]
    
    # 解析为图片
    images_buffer = await convert_file_to_images(file_content, filename)

    # 保存图片并生成嵌入
    image_ids = [f"{username}_{uuid.uuid4()}" for _ in range(len(images_buffer))]
    # 生成嵌入向量
    embeddings = await generate_embeddings(images_buffer, filename)
    logger.info(f"task:{task_id}: {filename} generate_embeddings!")

    # 插入Milvus
    collection_name = f"colqwen{knowledge_db_id.replace('-', '_')}"
    await insert_to_milvus(
        collection_name, embeddings, image_ids, file_meta["file_id"]
    )
    logger.info(f"task:{task_id}: images of {filename} insert to milvus {collection_name}!")

    await db.create_files(
        file_id=file_meta["file_id"],
        username=username,
        filename=filename,
        minio_filename=file_meta["minio_filename"],
        minio_url=file_meta["minio_url"],
        knowledge_db_id=knowledge_db_id,
        media_type='document'
    )
    await db.knowledge_base_add_file(
        knowledge_base_id=knowledge_db_id,
        file_id=file_meta["file_id"],
        original_filename=filename,
        minio_filename=file_meta["minio_filename"],
        minio_url=file_meta["minio_url"],
    )

    logger.info(f"task:{task_id}: save file of {filename} to mongodb")

    for i, (image_buffer, image_id) in enumerate(zip(images_buffer, image_ids)):
        # 保存图片到MinIO
        minio_imagename, image_url = await save_image_to_minio(
            username, filename, image_buffer
        )

        # 保存图片元数据
        await db.add_images(
            file_id=file_meta["file_id"],
            images_id=image_id,
            minio_filename=minio_imagename,
            minio_url=image_url,
            page_number=i + 1,
        )
    logger.info(f"task:{task_id}: save images of {filename} to minio and mongodb")


async def generate_embeddings(images_buffer, filename):
    # 将同步函数包装到线程池执行
    images_request = [
        ("images", (f"{filename}_{i}.png", img, "image/png"))
        for i, img in enumerate(images_buffer)
    ]
    return await get_embeddings_from_httpx(images_request, endpoint="embed_image")


async def insert_to_milvus(collection_name, embeddings, image_ids, file_id):
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(
        None,
        lambda: [
            milvus_client.insert(
                {
                    "colqwen_vecs": emb,
                    "page_number": i,
                    "image_id": image_ids[i],
                    "file_id": file_id,
                },
                collection_name,
            )
            for i, emb in enumerate(embeddings)
        ],
    )


async def insert_media_to_milvus(collection_name, embeddings, segment_ids, file_id, segments, media_type):
    """
    将音视频分段的embeddings插入到Milvus向量数据库
    
    Args:
        collection_name: 集合名称
        embeddings: 嵌入向量列表
        segment_ids: 分段ID列表
        file_id: 文件ID
        segments: 分段元数据列表
        media_type: 媒体类型 ('audio', 'video_frame', 'video_audio')
    """
    loop = asyncio.get_event_loop()
    
    def insert_records():
        for i, (emb, segment_id, segment) in enumerate(zip(embeddings, segment_ids, segments)):
            # 构建Milvus记录
            record = {
                "colqwen_vecs": emb,
                "page_number": i,  # 保持向后兼容
                "image_id": segment_id,  # 使用segment_id作为image_id
                "file_id": file_id,
                "media_type": media_type,
                "timestamp_start": segment.get('start_time', segment.get('timestamp', 0.0)),
                "timestamp_end": segment.get('end_time', segment.get('timestamp', 0.0)),
                "duration": segment.get('duration', 0.0),
                "segment_id": segment_id
            }
            
            # 插入到Milvus
            milvus_client.insert(record, collection_name)
    
    await loop.run_in_executor(None, insert_records)
    logger.info(f"Inserted {len(embeddings)} {media_type} embeddings to Milvus collection {collection_name}")


async def replace_image_content(messages):

    # 创建深拷贝以保证原始数据不变
    new_messages = copy.deepcopy(messages)
    # 遍历每条消息
    for message in new_messages:
        if "content" not in message:
            continue

        if not isinstance(message['content'], list):
            continue
        
        new_content = []  # 创建新的内容列表
        # 遍历content中的每个内容项
        for item in message["content"]:
            if isinstance(item, dict) and item.get("type") == "image_url":
                image_base64 = (
                    await async_minio_manager.download_image_and_convert_to_base64(
                        item["image_url"]
                    )
                )
                if image_base64:
                    new_item = copy.deepcopy(item)
                    new_item["image_url"] = {
                        "url": f"data:image/png;base64,{image_base64}"
                    }
                    new_content.append(new_item)
            else:
                new_content.append(item)
        message["content"] = new_content

    return new_messages
