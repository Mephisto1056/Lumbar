from pymilvus import MilvusClient, DataType
import numpy as np
import concurrent.futures
from app.core.config import settings
from app.core.logging import logger


class MilvusManager:
    def __init__(self):
        self.client = MilvusClient(uri=settings.milvus_uri)

    def delete_collection(self, collection_name: str):
        if self.client.has_collection(collection_name):
            self.client.drop_collection(collection_name)
            return True
        else:
            return False

    def delete_files(self, collection_name: str, file_ids: list):
        filter = "file_id in ["
        for file_id in file_ids:
            filter += f"'{file_id}', "
        filter += "]"
        res = self.client.delete(
            collection_name=collection_name,
            filter=filter,
        )
        return res

    def check_collection(self, collection_name: str):
        if self.client.has_collection(collection_name):
            return True
        else:
            return False

    def create_collection(self, collection_name: str, dim: int = 128, migrate_existing: bool = True) -> None:
        """
        创建collection，支持向后兼容
        
        Args:
            collection_name: collection名称
            dim: 向量维度
            migrate_existing: 是否迁移现有数据
        """
        existing_data = None
        
        # 如果collection存在且需要迁移，先备份数据
        if self.client.has_collection(collection_name) and migrate_existing:
            try:
                logger.info(f"Backing up existing data from {collection_name}")
                existing_data = self._backup_collection_data(collection_name)
                logger.info(f"Backed up {len(existing_data) if existing_data else 0} records")
            except Exception as e:
                logger.warning(f"Could not backup existing data: {e}")
        
        # 删除现有collection
        if self.client.has_collection(collection_name):
            self.client.drop_collection(collection_name)

        # 创建新schema
        schema = self.client.create_schema(
            auto_id=True,
            enable_dynamic_fields=True,
        )
        schema.add_field(field_name="pk", datatype=DataType.INT64, is_primary=True)
        schema.add_field(field_name="vector", datatype=DataType.FLOAT_VECTOR, dim=dim)
        schema.add_field(
            field_name="image_id", datatype=DataType.VARCHAR, max_length=65535
        )
        schema.add_field(field_name="page_number", datatype=DataType.INT64)
        schema.add_field(
            field_name="file_id", datatype=DataType.VARCHAR, max_length=65535
        )
        
        # 新增字段支持音视频，设置默认值以保证向后兼容
        schema.add_field(
            field_name="media_type", datatype=DataType.VARCHAR, max_length=50
        )  # image/audio/video/document
        schema.add_field(field_name="timestamp_start", datatype=DataType.FLOAT)  # 开始时间戳
        schema.add_field(field_name="timestamp_end", datatype=DataType.FLOAT)    # 结束时间戳
        schema.add_field(field_name="duration", datatype=DataType.FLOAT)         # 时长
        schema.add_field(
            field_name="segment_id", datatype=DataType.VARCHAR, max_length=65535
        )  # 音视频分段ID

        self.client.create_collection(collection_name=collection_name, schema=schema)
        self._create_index(collection_name)
        
        # 恢复现有数据，为旧数据添加默认值
        if existing_data and migrate_existing:
            try:
                logger.info(f"Migrating {len(existing_data)} records to new schema")
                self._restore_collection_data(collection_name, existing_data)
                logger.info("Data migration completed successfully")
            except Exception as e:
                logger.error(f"Failed to migrate existing data: {e}")
                raise

    def _create_index(self, collection_name):
        # Create an index on the vector field to enable fast similarity search.
        # Releases and drops any existing index before creating a new one with specified parameters.
        self.client.release_collection(collection_name=collection_name)
        self.client.drop_index(collection_name=collection_name, index_name="vector")
        index_params = self.client.prepare_index_params()
        index_params.add_index(
            field_name="vector",
            index_name="vector_index",
            index_type="HNSW",  # or any other index type you want
            metric_type="IP",  # or the appropriate metric type
            params={
                "M": 16,
                "efConstruction": 500,
            },  # adjust these parameters as needed
        )

        self.client.create_index(
            collection_name=collection_name, index_params=index_params, sync=True
        )
        self.client.load_collection(collection_name)

    def search(self, collection_name, data, topk, media_type_filter=None, time_range_filter=None):
        """
        执行向量搜索，支持向后兼容
        """
        try:
            return self._search_with_new_schema(collection_name, data, topk, media_type_filter, time_range_filter)
        except Exception as e:
            logger.warning(f"New schema search failed: {e}, falling back to old schema")
            return self._search_with_old_schema(collection_name, data, topk)
    
    def _search_with_new_schema(self, collection_name, data, topk, media_type_filter=None, time_range_filter=None):
        """使用新schema进行搜索"""
        search_params = {"metric_type": "IP", "params": {}}
        
        # 构建过滤条件
        filter_expr = None
        if media_type_filter:
            filter_expr = f"media_type == '{media_type_filter}'"
        if time_range_filter and len(time_range_filter) == 2:
            start_time, end_time = time_range_filter
            time_filter = f"timestamp_start >= {start_time} and timestamp_end <= {end_time}"
            if filter_expr:
                filter_expr = f"({filter_expr}) and ({time_filter})"
            else:
                filter_expr = time_filter
        
        # 更新输出字段，包含新增的媒体相关字段
        output_fields = [
            "vector", "image_id", "page_number", "file_id",
            "media_type", "timestamp_start", "timestamp_end", "duration", "segment_id"
        ]
        
        # 构建搜索参数
        search_kwargs = {
            "collection_name": collection_name,
            "data": data,
            "limit": int(50),
            "output_fields": output_fields,
            "search_params": search_params
        }
        
        # 只有在有过滤条件时才添加expr参数
        if filter_expr:
            search_kwargs["expr"] = filter_expr
            
        results = self.client.search(**search_kwargs)
        
        return self._process_search_results(results, data, collection_name, topk, output_fields)
    
    def _search_with_old_schema(self, collection_name, data, topk):
        """使用旧schema进行搜索（向后兼容）"""
        search_params = {"metric_type": "IP", "params": {}}
        
        # 旧schema的输出字段
        output_fields = ["vector", "image_id", "page_number", "file_id"]
        
        results = self.client.search(
            collection_name,
            data,
            limit=int(50),
            output_fields=output_fields,
            search_params=search_params
        )
        
        return self._process_search_results(results, data, collection_name, topk, output_fields, use_old_schema=True)
    
    def _process_search_results(self, results, data, collection_name, topk, output_fields, use_old_schema=False):
        """处理搜索结果"""
        image_ids = set()
        for r_id in range(len(results)):
            for r in range(len(results[r_id])):
                image_ids.add(results[r_id][r]["entity"]["image_id"])

        scores = []

        def rerank_single_doc(image_id, data, client, collection_name, output_fields, use_old_schema):
            doc_colbert_vecs = client.query(
                collection_name=collection_name,
                filter=f"image_id in ['{image_id}']",
                output_fields=output_fields,
                limit=1000,
            )
            
            if not doc_colbert_vecs:
                return (0.0, {"image_id": image_id, "file_id": None, "page_number": None})

            first_record = doc_colbert_vecs[0]
            
            if use_old_schema:
                # 为旧数据提供默认值
                metadata = {
                    "image_id": image_id,
                    "file_id": first_record["file_id"],
                    "page_number": first_record["page_number"],
                    "media_type": "image",  # 默认值
                    "timestamp_start": 0.0,  # 默认值
                    "timestamp_end": 0.0,    # 默认值
                    "duration": 0.0,         # 默认值
                    "segment_id": ""         # 默认值
                }
            else:
                # 使用新schema，但仍然提供默认值以防某些字段缺失
                metadata = {
                    "image_id": image_id,
                    "file_id": first_record["file_id"],
                    "page_number": first_record["page_number"],
                    "media_type": first_record.get("media_type", "image"),
                    "timestamp_start": first_record.get("timestamp_start", 0.0),
                    "timestamp_end": first_record.get("timestamp_end", 0.0),
                    "duration": first_record.get("duration", 0.0),
                    "segment_id": first_record.get("segment_id", "")
                }

            doc_vecs = np.vstack(
                [doc_colbert_vecs[i]["vector"] for i in range(len(doc_colbert_vecs))]
            )
            score = np.dot(data, doc_vecs.T).max(1).sum()
            return (score, metadata)

        with concurrent.futures.ThreadPoolExecutor(max_workers=300) as executor:
            futures = {
                executor.submit(
                    rerank_single_doc, image_id, data, self.client, collection_name, output_fields, use_old_schema
                ): image_id
                for image_id in image_ids
            }
            for future in concurrent.futures.as_completed(futures):
                score, metadata = future.result()
                scores.append((score, metadata))

        scores.sort(key=lambda x: x[0], reverse=True)
        return [
            {
                "score": score,
                "image_id": metadata["image_id"],
                "file_id": metadata["file_id"],
                "page_number": metadata["page_number"],
                "media_type": metadata["media_type"],
                "timestamp_start": metadata["timestamp_start"],
                "timestamp_end": metadata["timestamp_end"],
                "duration": metadata["duration"],
                "segment_id": metadata["segment_id"]
            }
            for score, metadata in scores[:topk]
        ]

    def insert(self, data, collection_name):
        # Insert ColQwen embeddings and metadata for a document into the collection.
        colqwen_vecs = [vec for vec in data["colqwen_vecs"]]
        seq_length = len(colqwen_vecs)

        # 获取媒体相关字段，为向后兼容设置默认值
        media_type = data.get("media_type", "image")
        timestamp_start = data.get("timestamp_start", 0.0)
        timestamp_end = data.get("timestamp_end", 0.0)
        duration = data.get("duration", 0.0)
        segment_id = data.get("segment_id", "")

        # Insert the data as multiple vectors (one for each sequence) along with the corresponding metadata.
        self.client.insert(
            collection_name,
            [
                {
                    "vector": colqwen_vecs[i],
                    "image_id": data["image_id"],
                    "page_number": data["page_number"],
                    "file_id": data["file_id"],
                    "media_type": media_type,
                    "timestamp_start": timestamp_start,
                    "timestamp_end": timestamp_end,
                    "duration": duration,
                    "segment_id": segment_id
                }
                for i in range(seq_length)
            ],
        )


    def _backup_collection_data(self, collection_name: str):
        """备份collection中的所有数据"""
        try:
            # 检查collection是否存在
            if not self.client.has_collection(collection_name):
                return None
            
            # 获取collection的所有数据
            # 使用空查询获取所有记录
            all_data = self.client.query(
                collection_name=collection_name,
                filter="",  # 空过滤器获取所有数据
                output_fields=["*"],  # 获取所有字段
                limit=100000  # 设置一个较大的限制
            )
            
            logger.info(f"Backed up {len(all_data)} records from {collection_name}")
            return all_data
            
        except Exception as e:
            logger.error(f"Failed to backup collection {collection_name}: {e}")
            return None
    
    def _restore_collection_data(self, collection_name: str, data_records):
        """恢复数据到新的collection schema，为旧数据添加默认值"""
        if not data_records:
            return
        
        try:
            # 转换旧数据格式，添加新字段的默认值
            migrated_data = []
            
            for record in data_records:
                # 保留原有字段
                migrated_record = {
                    "vector": record.get("vector"),
                    "image_id": record.get("image_id"),
                    "page_number": record.get("page_number", 0),
                    "file_id": record.get("file_id"),
                }
                
                # 为新字段添加默认值
                migrated_record.update({
                    "media_type": record.get("media_type", "image"),  # 默认为图像
                    "timestamp_start": record.get("timestamp_start", 0.0),
                    "timestamp_end": record.get("timestamp_end", 0.0),
                    "duration": record.get("duration", 0.0),
                    "segment_id": record.get("segment_id", "")
                })
                
                migrated_data.append(migrated_record)
            
            # 批量插入迁移后的数据
            if migrated_data:
                self.client.insert(collection_name, migrated_data)
                logger.info(f"Successfully migrated {len(migrated_data)} records to {collection_name}")
            
        except Exception as e:
            logger.error(f"Failed to restore data to collection {collection_name}: {e}")
            raise
    
    def migrate_collection_schema(self, collection_name: str, dim: int = 128):
        """
        迁移现有collection到新schema
        
        Args:
            collection_name: collection名称
            dim: 向量维度
        """
        logger.info(f"Starting schema migration for collection: {collection_name}")
        
        try:
            # 检查collection是否存在
            if not self.client.has_collection(collection_name):
                logger.info(f"Collection {collection_name} does not exist, creating new one")
                self.create_collection(collection_name, dim, migrate_existing=False)
                return
            
            # 执行迁移
            self.create_collection(collection_name, dim, migrate_existing=True)
            logger.info(f"Schema migration completed for collection: {collection_name}")
            
        except Exception as e:
            logger.error(f"Schema migration failed for collection {collection_name}: {e}")
            raise


milvus_client = MilvusManager()
