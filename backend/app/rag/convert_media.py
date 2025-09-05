import os
import tempfile
import asyncio
from fastapi import UploadFile
from app.db.miniodb import async_minio_manager
from bson.objectid import ObjectId
import time
from app.core.logging import logger
import io
from typing import List, Dict, Any, Optional, Tuple
import mimetypes
from pydub import AudioSegment
import cv2
import numpy as np
from PIL import Image
import librosa
import soundfile as sf
from moviepy.editor import VideoFileClip
import json


class MediaConverter:
    """音视频文件转换和处理服务"""
    
    def __init__(self):
        self.supported_audio_formats = ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma']
        self.supported_video_formats = ['mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'webm']
        self.audio_segment_duration = 30  # 音频分段时长（秒）
        self.video_frame_interval = 1     # 视频帧提取间隔（秒）
        self.max_audio_duration = 3600    # 最大音频时长（秒）
        self.max_video_duration = 7200    # 最大视频时长（秒）
        
        # 安全限制
        self.max_file_size = 500 * 1024 * 1024  # 500MB最大文件大小
        self.max_temp_files = 10  # 最大并发临时文件数
        self._temp_file_count = 0  # 当前临时文件计数

    async def process_audio_file(self, file_content: bytes, filename: str) -> Dict[str, Any]:
        """
        处理音频文件，提取元数据和分段信息
        
        Args:
            file_content: 音频文件字节内容
            filename: 文件名
            
        Returns:
            包含音频元数据和分段信息的字典
        """
        start_time = time.time()
        
        # 安全检查
        if len(file_content) > self.max_file_size:
            raise ValueError(f"File size {len(file_content)} bytes exceeds maximum {self.max_file_size} bytes")
        
        if self._temp_file_count >= self.max_temp_files:
            raise RuntimeError("Too many concurrent temporary files")
        
        try:
            self._temp_file_count += 1
            
            # 使用安全的临时文件处理 - 自动删除
            with tempfile.NamedTemporaryFile(
                suffix=f".{filename.split('.')[-1]}",
                delete=True,  # 确保自动删除
                dir=tempfile.gettempdir()  # 明确指定临时目录
            ) as temp_file:
                temp_file.write(file_content)
                temp_file.flush()  # 确保数据写入磁盘
                temp_path = temp_file.name
                
                # 使用librosa加载音频获取基本信息
                y, sr = librosa.load(temp_path, sr=None)
                duration = len(y) / sr
                
                # 检查时长限制
                if duration > self.max_audio_duration:
                    raise ValueError(f"Audio duration {duration:.2f}s exceeds maximum {self.max_audio_duration}s")
                
                # 使用pydub获取更详细的元数据
                audio = AudioSegment.from_file(temp_path)
                
                # 提取音频元数据
                metadata = {
                    'duration': duration,
                    'sample_rate': sr,
                    'channels': audio.channels,
                    'frame_rate': audio.frame_rate,
                    'sample_width': audio.sample_width,
                    'format': filename.split('.')[-1].lower(),
                    'file_size': len(file_content)
                }
                
                # 生成音频分段信息
                segments = []
                for start_sec in range(0, int(duration), self.audio_segment_duration):
                    end_sec = min(start_sec + self.audio_segment_duration, duration)
                    
                    segment_info = {
                        'segment_id': str(ObjectId()),
                        'start_time': start_sec,
                        'end_time': end_sec,
                        'duration': end_sec - start_sec,
                    }
                    segments.append(segment_info)
                
                processing_time = time.time() - start_time
                logger.info(f"Successfully processed audio file {filename} | Duration: {duration:.2f}s | Segments: {len(segments)} | Time: {processing_time:.2f}s")
                
                return {
                    'success': True,
                    'media_type': 'audio',
                    'metadata': metadata,
                    'segments': segments,
                    'processing_time': processing_time
                }
                
        except Exception as e:
            logger.error(f"Error processing audio file {filename}: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'media_type': 'audio'
            }
        finally:
            self._temp_file_count = max(0, self._temp_file_count - 1)

    async def process_video_file(self, file_content: bytes, filename: str) -> Dict[str, Any]:
        """
        处理视频文件，提取关键帧和音频信息
        
        Args:
            file_content: 视频文件字节内容
            filename: 文件名
            
        Returns:
            包含视频元数据、关键帧和音频信息的字典
        """
        start_time = time.time()
        
        # 安全检查
        if len(file_content) > self.max_file_size:
            raise ValueError(f"File size {len(file_content)} bytes exceeds maximum {self.max_file_size} bytes")
        
        if self._temp_file_count >= self.max_temp_files:
            raise RuntimeError("Too many concurrent temporary files")
        
        temp_path = None
        try:
            self._temp_file_count += 1
            
            # 使用安全的临时文件处理 - 自动删除
            with tempfile.NamedTemporaryFile(
                suffix=f".{filename.split('.')[-1]}",
                delete=True,  # 确保自动删除
                dir=tempfile.gettempdir()  # 明确指定临时目录
            ) as temp_file:
                temp_file.write(file_content)
                temp_file.flush()  # 确保数据写入磁盘
                temp_path = temp_file.name
                
                # 使用OpenCV获取视频信息
                cap = cv2.VideoCapture(temp_path)
                
                if not cap.isOpened():
                    raise ValueError("Cannot open video file")
                
                fps = cap.get(cv2.CAP_PROP_FPS)
                frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
                width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                duration = frame_count / fps if fps > 0 else 0
                
                # 检查时长限制
                if duration > self.max_video_duration:
                    raise ValueError(f"Video duration {duration:.2f}s exceeds maximum {self.max_video_duration}s")
                
                # 提取关键帧信息（不实际提取图像，只记录时间戳）
                frame_timestamps = []
                if fps > 0:
                    frame_interval_frames = int(fps * self.video_frame_interval)
                    for frame_idx in range(0, frame_count, frame_interval_frames):
                        timestamp = frame_idx / fps
                        frame_timestamps.append({
                            'frame_id': str(ObjectId()),
                            'timestamp': timestamp,
                            'frame_idx': frame_idx
                        })
                
                cap.release()
                
                # 检查是否有音频轨道
                has_audio = False
                audio_metadata = None
                
                try:
                    # 使用moviepy检查音频
                    with VideoFileClip(temp_path) as video_clip:
                        if video_clip.audio is not None:
                            has_audio = True
                            audio_duration = video_clip.audio.duration
                            
                            # 生成音频分段（如果有音频）
                            audio_segments = []
                            for start_sec in range(0, int(audio_duration), self.audio_segment_duration):
                                end_sec = min(start_sec + self.audio_segment_duration, audio_duration)
                                audio_segments.append({
                                    'segment_id': str(ObjectId()),
                                    'start_time': start_sec,
                                    'end_time': end_sec,
                                    'duration': end_sec - start_sec
                                })
                            
                            audio_metadata = {
                                'has_audio': True,
                                'duration': audio_duration,
                                'segments': audio_segments
                            }
                except Exception as audio_error:
                    logger.warning(f"Could not process audio track: {audio_error}")
                    audio_metadata = {'has_audio': False}
                
                # 构建视频元数据
                metadata = {
                    'duration': duration,
                    'fps': fps,
                    'frame_count': frame_count,
                    'resolution': f"{width}x{height}",
                    'width': width,
                    'height': height,
                    'format': filename.split('.')[-1].lower(),
                    'file_size': len(file_content),
                    'has_audio': has_audio
                }
                
                processing_time = time.time() - start_time
                logger.info(f"Successfully processed video file {filename} | Duration: {duration:.2f}s | Frames: {len(frame_timestamps)} | Time: {processing_time:.2f}s")
                
                return {
                    'success': True,
                    'media_type': 'video',
                    'metadata': metadata,
                    'frame_timestamps': frame_timestamps,
                    'audio_metadata': audio_metadata,
                    'processing_time': processing_time
                }
                
        except Exception as e:
            logger.error(f"Error processing video file {filename}: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'media_type': 'video'
            }
        finally:
            self._temp_file_count = max(0, self._temp_file_count - 1)

    async def extract_video_frames(self, file_content: bytes, timestamps: List[float]) -> List[bytes]:
        """
        从视频中提取指定时间戳的帧
        
        Args:
            file_content: 视频文件字节内容
            timestamps: 需要提取的时间戳列表
            
        Returns:
            帧图像字节数据列表
        """
        try:
            # 安全检查
            if len(file_content) > self.max_file_size:
                raise ValueError(f"File size {len(file_content)} bytes exceeds maximum {self.max_file_size} bytes")
            
            with tempfile.NamedTemporaryFile(
                suffix=".mp4",
                delete=True,  # 确保自动删除
                dir=tempfile.gettempdir()
            ) as temp_file:
                temp_file.write(file_content)
                temp_file.flush()
                temp_path = temp_file.name
                
                cap = cv2.VideoCapture(temp_path)
                if not cap.isOpened():
                    raise ValueError("Cannot open video file for frame extraction")
                    
                fps = cap.get(cv2.CAP_PROP_FPS)
                frames = []
                
                for timestamp in timestamps:
                    frame_number = int(timestamp * fps)
                    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_number)
                    
                    ret, frame = cap.read()
                    if ret:
                        # 转换为RGB并编码为JPEG
                        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                        pil_image = Image.fromarray(frame_rgb)
                        
                        # 转换为字节
                        img_buffer = io.BytesIO()
                        pil_image.save(img_buffer, format='JPEG', quality=85)
                        frames.append(img_buffer.getvalue())
                
                cap.release()
                return frames
                    
        except Exception as e:
            logger.error(f"Error extracting video frames: {str(e)}")
            return []

    async def extract_audio_segment(self, file_content: bytes, start_time: float, end_time: float) -> Optional[bytes]:
        """
        从音频文件中提取指定时间段
        
        Args:
            file_content: 音频文件字节内容
            start_time: 开始时间（秒）
            end_time: 结束时间（秒）
            
        Returns:
            音频段字节数据
        """
        try:
            # 安全检查
            if len(file_content) > self.max_file_size:
                raise ValueError(f"File size {len(file_content)} bytes exceeds maximum {self.max_file_size} bytes")
            
            with tempfile.NamedTemporaryFile(
                suffix=".wav",
                delete=True,  # 确保自动删除
                dir=tempfile.gettempdir()
            ) as temp_file:
                temp_file.write(file_content)
                temp_file.flush()
                temp_path = temp_file.name
                
                # 使用pydub提取音频段
                audio = AudioSegment.from_file(temp_path)
                start_ms = int(start_time * 1000)
                end_ms = int(end_time * 1000)
                
                segment = audio[start_ms:end_ms]
                
                # 导出为WAV格式
                output_buffer = io.BytesIO()
                segment.export(output_buffer, format="wav")
                return output_buffer.getvalue()
                    
        except Exception as e:
            logger.error(f"Error extracting audio segment: {str(e)}")
            return None

    def detect_media_type(self, filename: str, content_type: str = None) -> str:
        """
        检测媒体文件类型
        
        Args:
            filename: 文件名
            content_type: MIME类型
            
        Returns:
            媒体类型：'audio', 'video', 'image', 'document', 'unknown'
        """
        if not filename:
            return 'unknown'
        
        extension = filename.lower().split('.')[-1]
        
        if extension in self.supported_audio_formats:
            return 'audio'
        elif extension in self.supported_video_formats:
            return 'video'
        elif extension in ['jpg', 'jpeg', 'png', 'bmp', 'gif', 'tiff', 'webp']:
            return 'image'
        elif extension in ['pdf', 'docx', 'doc', 'pptx', 'ppt', 'xlsx', 'xls', 'txt']:
            return 'document'
        else:
            # 尝试通过MIME类型判断
            if content_type:
                if content_type.startswith('audio/'):
                    return 'audio'
                elif content_type.startswith('video/'):
                    return 'video'
                elif content_type.startswith('image/'):
                    return 'image'
            
            return 'unknown'


# 全局实例
media_converter = MediaConverter()


async def save_media_to_minio(username: str, uploadfile: UploadFile) -> Tuple[str, str]:
    """
    保存媒体文件到MinIO
    
    Args:
        username: 用户名
        uploadfile: 上传的文件
        
    Returns:
        (文件名, MinIO URL) 元组
    """
    media_type = media_converter.detect_media_type(uploadfile.filename, uploadfile.content_type)
    file_extension = uploadfile.filename.split('.')[-1] if uploadfile.filename else 'bin'
    
    file_name = f"{username}_{media_type}_{ObjectId()}.{file_extension}"
    await async_minio_manager.upload_file(file_name, uploadfile)
    minio_url = await async_minio_manager.create_presigned_url(file_name)
    return file_name, minio_url


async def process_media_file(file_content: bytes, filename: str) -> Dict[str, Any]:
    """
    处理媒体文件（音频或视频）
    
    Args:
        file_content: 文件字节内容
        filename: 文件名
        
    Returns:
        处理结果字典
    """
    media_type = media_converter.detect_media_type(filename)
    
    if media_type == 'audio':
        return await media_converter.process_audio_file(file_content, filename)
    elif media_type == 'video':
        return await media_converter.process_video_file(file_content, filename)
    else:
        return {
            'success': False,
            'error': f'Unsupported media type: {media_type}',
            'media_type': media_type
        }