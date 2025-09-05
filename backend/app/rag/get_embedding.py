import json
import httpx
import numpy as np
from typing import Literal, List, Union, Dict, Any
from io import BytesIO

from tenacity import retry, stop_after_attempt, wait_exponential
# @retry(
#     stop=stop_after_attempt(3),
#     wait=wait_exponential(multiplier=1, min=4, max=10)
# )
async def get_embeddings_from_httpx(
    data: list,
    endpoint: Literal["embed_text", "embed_image", "embed_audio", "embed_video", "embed_multimodal"]  # 扩展端点类型
):
    """
    通用embedding获取函数，支持多种模态
    
    Args:
        data: 数据列表，根据endpoint类型不同格式也不同
        endpoint: 端点类型
        
    Returns:
        embeddings列表或处理结果
    """
    async with httpx.AsyncClient() as client:
        try:
            if endpoint == "embed_text":
                response = await client.post(
                    f"http://model-server:8005/{endpoint}",
                    json={"queries": data},
                    timeout=1200.0
                )
            elif endpoint == "embed_image":
                response = await client.post(
                    f"http://model-server:8005/{endpoint}",
                    files=data,
                    timeout=1200.0
                )
            elif endpoint in ["embed_audio", "embed_video"]:
                response = await client.post(
                    f"http://model-server:8005/{endpoint}",
                    files=data,
                    timeout=3600.0  # 音视频处理需要更长时间
                )
            elif endpoint == "embed_multimodal":
                response = await client.post(
                    f"http://model-server:8005/{endpoint}",
                    files=data,
                    timeout=3600.0
                )
            else:
                raise ValueError(f"Unsupported endpoint: {endpoint}")
                
            response.raise_for_status()
            result = response.json()
            
            # 根据不同端点返回不同格式
            if endpoint == "embed_text" or endpoint == "embed_image":
                return result["embeddings"]
            else:
                return result["results"]  # 音视频返回更复杂的结构
                
        except httpx.HTTPStatusError as e:
            raise Exception(f"HTTP request failed: {e}")
        except json.JSONDecodeError as e:
            raise Exception(f"JSON decode failed: {e}")


async def get_audio_embeddings(audio_files: List[bytes]) -> List[Dict[str, Any]]:
    """
    获取音频文件的embeddings
    
    Args:
        audio_files: 音频文件字节数据列表
        
    Returns:
        包含分段embeddings的结果列表
    """
    files = []
    for i, audio_data in enumerate(audio_files):
        files.append(("audios", (f"audio_{i}.wav", BytesIO(audio_data), "audio/wav")))
    
    return await get_embeddings_from_httpx(files, "embed_audio")


async def get_video_embeddings(video_files: List[bytes]) -> List[Dict[str, Any]]:
    """
    获取视频文件的embeddings（包括视觉帧和音频轨道）
    
    Args:
        video_files: 视频文件字节数据列表
        
    Returns:
        包含帧embeddings和音频embeddings的结果列表
    """
    files = []
    for i, video_data in enumerate(video_files):
        files.append(("videos", (f"video_{i}.mp4", BytesIO(video_data), "video/mp4")))
    
    return await get_embeddings_from_httpx(files, "embed_video")


async def get_multimodal_embeddings(files: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    获取多模态文件的embeddings
    
    Args:
        files: 文件信息列表，每个元素包含 {'data': bytes, 'filename': str, 'content_type': str}
        
    Returns:
        多模态处理结果列表
    """
    upload_files = []
    for i, file_info in enumerate(files):
        filename = file_info.get('filename', f'file_{i}')
        content_type = file_info.get('content_type', 'application/octet-stream')
        data = file_info['data']
        
        upload_files.append(("files", (filename, BytesIO(data), content_type)))
    
    return await get_embeddings_from_httpx(upload_files, "embed_multimodal")


# 兼容性函数，保持原有接口
async def get_text_embeddings(texts: List[str]) -> List[List[float]]:
    """获取文本embeddings（兼容性函数）"""
    return await get_embeddings_from_httpx(texts, "embed_text")


async def get_image_embeddings(image_files: List[bytes]) -> List[List[float]]:
    """获取图像embeddings（兼容性函数）"""
    files = []
    for i, image_data in enumerate(image_files):
        files.append(("images", (f"image_{i}.png", BytesIO(image_data), "image/png")))
    
    return await get_embeddings_from_httpx(files, "embed_image")