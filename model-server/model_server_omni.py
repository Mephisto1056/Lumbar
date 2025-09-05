# 新建文件 app/core/model_server_omni.py
from io import BytesIO
from typing import List
from fastapi import FastAPI, File, UploadFile, status, HTTPException
from fastapi.responses import JSONResponse
from colbert_service_omni import colbert_omni
import uvicorn
from pydantic import BaseModel
from PIL import Image
import mimetypes

app = FastAPI()
service = colbert_omni  # 单实例加载

class TextRequest(BaseModel):
    queries: list  # 显式定义字段

class MultiModalFile(BaseModel):
    type: str
    data: bytes

@app.post("/embed_text")
async def embed_text(request: TextRequest):
    """文本embedding接口"""
    return {"embeddings": service.process_query(request.queries)}

@app.post("/embed_image")
async def embed_image(images: List[UploadFile] = File(...)):
    """图像embedding接口"""
    pil_images = []
    for image_file in images:
        # 验证文件类型
        content_type = image_file.content_type
        if not content_type or not content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail=f"Invalid image file: {image_file.filename}")
        
        # 读取二进制流并转为 PIL.Image
        content = await image_file.read()
        buffer = BytesIO(content)
        image = Image.open(buffer)
        pil_images.append(image)
        # 重要：关闭文件流避免内存泄漏
        await image_file.close()
    
    return {"embeddings": service.process_image(pil_images)}

@app.post("/embed_audio")
async def embed_audio(audios: List[UploadFile] = File(...)):
    """音频embedding接口"""
    audio_data = []
    
    for audio_file in audios:
        # 验证文件类型
        content_type = audio_file.content_type
        if not content_type or not content_type.startswith('audio/'):
            # 通过文件扩展名进一步验证
            filename = audio_file.filename.lower() if audio_file.filename else ""
            if not any(filename.endswith(ext) for ext in ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a']):
                raise HTTPException(status_code=400, detail=f"Invalid audio file: {audio_file.filename}")
        
        # 读取音频文件
        content = await audio_file.read()
        audio_data.append(content)
        await audio_file.close()
    
    try:
        results = service.process_audio(audio_data)
        return {"results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Audio processing failed: {str(e)}")

@app.post("/embed_video")
async def embed_video(videos: List[UploadFile] = File(...)):
    """视频embedding接口"""
    video_data = []
    
    for video_file in videos:
        # 验证文件类型
        content_type = video_file.content_type
        if not content_type or not content_type.startswith('video/'):
            # 通过文件扩展名进一步验证
            filename = video_file.filename.lower() if video_file.filename else ""
            if not any(filename.endswith(ext) for ext in ['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.flv']):
                raise HTTPException(status_code=400, detail=f"Invalid video file: {video_file.filename}")
        
        # 读取视频文件
        content = await video_file.read()
        video_data.append(content)
        await video_file.close()
    
    try:
        results = service.process_video(video_data)
        return {"results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Video processing failed: {str(e)}")

@app.post("/embed_multimodal")
async def embed_multimodal(files: List[UploadFile] = File(...)):
    """多模态文件embedding接口"""
    file_data = []
    
    for file in files:
        content = await file.read()
        content_type = file.content_type or mimetypes.guess_type(file.filename)[0] or 'application/octet-stream'
        
        file_data.append({
            'type': content_type,
            'data': content,
            'filename': file.filename
        })
        await file.close()
    
    try:
        results = service.process_multimodal(file_data)
        return {"results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Multimodal processing failed: {str(e)}")

@app.get("/supported_formats")
async def get_supported_formats():
    """获取支持的文件格式"""
    return {
        "image_formats": ["jpg", "jpeg", "png", "bmp", "gif", "tiff", "webp"],
        "audio_formats": ["mp3", "wav", "flac", "aac", "ogg", "m4a"],
        "video_formats": ["mp4", "avi", "mov", "mkv", "wmv", "flv"],
        "text_formats": ["txt"]
    }

@app.get("/model_info")
async def get_model_info():
    """获取模型信息"""
    return {
        "model_name": "ColQwen-omni",
        "version": "v0.1",
        "capabilities": ["text", "image", "audio", "video"],
        "embedding_dimension": 128,
        "max_audio_duration": 3600,  # 秒
        "max_video_duration": 7200,  # 秒
        "audio_segment_duration": 30,  # 秒
        "video_frame_interval": 1  # 秒
    }

# 健康检查
@app.get("/healthy-check", response_model=dict)
async def healthy_check():
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={"status": "UP", "details": "ColQwen-omni model server operational"},
    )

# 详细健康检查
@app.get("/health/detailed")
async def detailed_health_check():
    """详细的健康检查，包括模型状态"""
    try:
        # 测试模型是否正常工作
        test_query = ["test query"]
        test_result = service.process_query(test_query)
        
        return {
            "status": "UP",
            "model_loaded": True,
            "device": str(service.device),
            "test_embedding_shape": len(test_result[0]) if test_result else 0,
            "capabilities": {
                "text_processing": True,
                "image_processing": True,
                "audio_processing": True,
                "video_processing": True
            }
        }
    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "DOWN",
                "error": str(e),
                "model_loaded": False
            }
        )

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8005)