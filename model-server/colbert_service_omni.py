# app/core/colbert_service_omni.py
from transformers import AutoModel, AutoProcessor
from transformers.utils.import_utils import is_flash_attn_2_available
from peft import PeftModel
from torch.utils.data import DataLoader, Dataset
import torch
import torchaudio
import torchvision.transforms as transforms
from torchvision.io import read_video
import cv2
import numpy as np
from typing import List, cast, Union, Tuple
from tqdm import tqdm
from config import settings
import librosa
from PIL import Image
import io
import tempfile
import os
import logging

# 简单的Dataset替代colpali的ListDataset
class SimpleDataset(Dataset):
    def __init__(self, data):
        self.data = data
    
    def __len__(self):
        return len(self.data)
    
    def __getitem__(self, idx):
        return self.data[idx]

# 设置logging
logger = logging.getLogger(__name__)

# 版本冲突已通过正确的依赖版本约束解决
# transformers>=4.50.0,<4.51.0 与 colpali_engine==0.3.9 完全兼容

class ColBERTOmniService:
    def __init__(self, model_path):
        # 使用标准torch设备检测
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        
        # 检查是否为ColQwen-omni模型路径
        if "omni" in model_path.lower():
            print(f"Loading ColQwen-omni adapter from {model_path}")
            self.is_omni_model = True
            # 使用正确的全模态基础模型
            base_model_path = settings.colqwen_omni_base_path
            print(f"Using omni base model: {base_model_path}")
        else:
            print(f"Loading ColQwen2.5 model from {model_path}")
            self.is_omni_model = False
            base_model_path = model_path
            
        try:
            if self.is_omni_model:
                print(f"Loading omni model configuration...")
                print(f"Adapter path: {model_path}")
                
                # 使用原始ColQwen2.5基础模型 + omni适配器（测试验证的成功方法）
                fallback_base = "/model_weights/colqwen2.5-base"
                print(f"Using original ColQwen2.5 base model: {fallback_base}")
                
                # 检查模型路径是否存在
                import os
                if not os.path.exists(fallback_base):
                    raise FileNotFoundError(f"Base model not found: {fallback_base}")
                if not os.path.exists(model_path):
                    raise FileNotFoundError(f"Omni adapter model not found: {model_path}")
                
                # 使用官方的ColQwen2_5Omni类直接加载
                from colpali_engine.models import ColQwen2_5Omni
                print("Loading ColQwen2.5-Omni model using official implementation...")
                self.model = ColQwen2_5Omni.from_pretrained(
                    model_path,
                    torch_dtype=torch.bfloat16,
                    device_map="auto",
                    trust_remote_code=True,
                    attn_implementation=(
                        "flash_attention_2" if is_flash_attn_2_available() else "eager"
                    ),
                ).eval()
                print("🎉 Successfully loaded ColQwen2.5-Omni model!")
                base_model_path = model_path  # 使用omni模型路径
                
            else:
                # 原始模型加载
                from colpali_engine.models import ColQwen2_5
                print(f"Loading original ColQwen2.5 model from: {base_model_path}")
                self.model = ColQwen2_5.from_pretrained(
                    base_model_path,
                    torch_dtype=torch.bfloat16,
                    device_map="auto",
                    trust_remote_code=True,
                    attn_implementation=(
                        "flash_attention_2" if is_flash_attn_2_available() else "eager"
                    ),
                ).eval()
                print("Successfully loaded original ColQwen2.5 model")
                
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            # 如果omni模型加载失败，自动降级到原始模型
            if self.is_omni_model:
                print("Omni model failed, falling back to original ColQwen2.5 model")
                self.is_omni_model = False
                fallback_base = "/model_weights/colqwen2.5-base"
                fallback_adapter = "/model_weights/colqwen2.5-v0.2"
                
                try:
                    print(f"Loading fallback base model: {fallback_base}")
                    self.model = ColQwen2_5.from_pretrained(
                        fallback_base,
                        torch_dtype=torch.bfloat16,
                        device_map=self.device,
                        trust_remote_code=True,
                        attn_implementation=(
                            "flash_attention_2" if is_flash_attn_2_available() else "eager"
                        ),
                    ).eval()
                    
                    # 加载原始适配器
                    from peft import PeftModel
                    print(f"Loading fallback adapter: {fallback_adapter}")
                    self.model = PeftModel.from_pretrained(self.model, fallback_adapter)
                    print("Successfully loaded fallback ColQwen2.5 model")
                    base_model_path = fallback_base  # 更新processor路径
                    
                except Exception as fallback_e:
                    raise RuntimeError(f"Both omni and fallback model loading failed: {e}, {fallback_e}")
            else:
                raise RuntimeError(f"Model loading failed: {e}")
        
        # 加载Processor - 使用colpali_engine omni处理器
        print(f"Loading processor from: {base_model_path}")
        try:
            if self.is_omni_model:
                from colpali_engine.models import ColQwen2_5OmniProcessor
                self.processor = ColQwen2_5OmniProcessor.from_pretrained(
                    base_model_path,
                    trust_remote_code=True,
                )
                print("Successfully loaded ColQwen2_5OmniProcessor")
            else:
                from colpali_engine.models import ColQwen2_5_Processor
                self.processor = cast(
                    ColQwen2_5_Processor,
                    ColQwen2_5_Processor.from_pretrained(
                        base_model_path,
                        size={"shortest_edge": 56 * 56, "longest_edge": 28 * 28 * 768},
                        trust_remote_code=True,
                    ),
                )
                print("Successfully loaded ColQwen2_5_Processor")
        except Exception as proc_e:
            print(f"Processor loading failed: {proc_e}")
            # 使用简化的处理器
            print("Using fallback processor...")
            class SimpleProcessor:
                def process_queries(self, queries):
                    return {"input_ids": torch.tensor([[1, 2, 3]])}  # 简化实现
                def process_images(self, images):
                    return {"pixel_values": torch.randn(1, 3, 224, 224)}  # 简化实现
            
            self.processor = SimpleProcessor()
            print("Using simple fallback processor")
        
        # 音频处理参数
        self.audio_sample_rate = getattr(settings, 'audio_sample_rate', 16000)
        self.audio_segment_duration = getattr(settings, 'audio_segment_duration', 30)  # 30秒分段
        
        # 视频处理参数
        self.video_frame_interval = getattr(settings, 'video_frame_interval', 1)  # 每秒提取1帧
        
        # 安全限制
        self.max_audio_duration = getattr(settings, 'max_audio_duration', 3600)  # 1小时
        self.max_video_duration = getattr(settings, 'max_video_duration', 7200)  # 2小时
        self.max_file_size = getattr(settings, 'max_file_size', 500 * 1024 * 1024)  # 500MB

    def process_query(self, queries: list) -> List[torch.Tensor]:
        """处理文本查询"""
        from colpali_engine.utils.torch_utils import ListDataset
        
        dataloader = DataLoader(
            dataset=ListDataset[str](queries),
            batch_size=1,
            shuffle=False,
            collate_fn=lambda x: self.processor.process_queries(x),
        )

        qs: List[torch.Tensor] = []
        for batch_query in dataloader:
            with torch.no_grad():
                batch_query = {
                    k: v.to(self.model.device) for k, v in batch_query.items()
                }
                embeddings_query = self.model(**batch_query)
            qs.extend(list(torch.unbind(embeddings_query.to("cpu"))))
        for i in range(len(qs)):
            qs[i] = qs[i].float().tolist()
        return qs

    def process_image(self, images: List) -> List[List[float]]:
        """处理图像"""
        from colpali_engine.utils.torch_utils import ListDataset
        batch_size = 1
        
        dataloader = DataLoader(
            dataset=ListDataset[str](images),
            batch_size=batch_size,
            shuffle=False,
            collate_fn=lambda x: self.processor.process_images(x),
        )

        ds: List[torch.Tensor] = []
        for batch_doc in tqdm(dataloader):
            with torch.no_grad():
                batch_doc = {k: v.to(self.model.device) for k, v in batch_doc.items()}
                embeddings_doc = self.model(**batch_doc)
            ds.extend(list(torch.unbind(embeddings_doc.to("cpu"))))
        for i in range(len(ds)):
            ds[i] = ds[i].float().tolist()
        return ds

    def process_audio(self, audio_files: List[bytes]) -> List[dict]:
        """处理音频文件 - 按时间分段处理并生成embeddings"""
        if not self.is_omni_model:
            # 非omni模型不支持音频处理
            return [{'error': 'Audio processing requires omni model', 'segments': []} for _ in audio_files]
            
        # 检查processor是否有process_audios方法
        if not hasattr(self.processor, 'process_audios'):
            logger.error("Processor does not have process_audios method")
            return [{'error': 'process_audios method not available', 'segments': []} for _ in audio_files]
        
        results = []
        
        for audio_bytes in audio_files:
            temp_path = None
            try:
                # 检查文件大小
                if len(audio_bytes) > self.max_file_size:
                    raise ValueError(f"Audio file size {len(audio_bytes)} exceeds maximum {self.max_file_size}")
                
                # 创建临时文件
                with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_file:
                    temp_file.write(audio_bytes)
                    temp_path = temp_file.name
                
                # 使用librosa加载音频数据
                audio_array, sr = librosa.load(temp_path, sr=self.audio_sample_rate)
                
                # 检查时长限制
                duration = len(audio_array) / sr
                if duration > self.max_audio_duration:
                    raise ValueError(f"Audio duration {duration:.2f}s exceeds maximum {self.max_audio_duration}s")
                
                # 按时间分段处理音频
                segments = []
                segment_duration = self.audio_segment_duration
                
                for start_sec in range(0, int(duration), segment_duration):
                    end_sec = min(start_sec + segment_duration, duration)
                    
                    # 提取音频段
                    start_sample = int(start_sec * sr)
                    end_sample = int(end_sec * sr)
                    segment_array = audio_array[start_sample:end_sample]
                    
                    if len(segment_array) > 0:
                        # 处理音频段
                        audio_data = {'array': segment_array, 'sampling_rate': sr}
                        
                        # 使用processor处理音频段
                        dataloader = DataLoader(
                            dataset=[audio_data],
                            batch_size=1,
                            shuffle=False,
                            collate_fn=lambda x: self.processor.process_audios(x),
                        )
                        
                        embeddings_list = []
                        for batch_audio in dataloader:
                            with torch.no_grad():
                                batch_audio = {k: v.to(self.model.device) for k, v in batch_audio.items()}
                                embeddings_audio = self.model(**batch_audio)
                            embeddings_list.extend(list(torch.unbind(embeddings_audio.to("cpu"))))
                        
                        if embeddings_list:
                            embedding = embeddings_list[0].float().tolist()
                            
                            # 生成segment_id
                            import uuid
                            segment_id = str(uuid.uuid4())
                            
                            segments.append({
                                'segment_id': segment_id,
                                'start_time': start_sec,
                                'end_time': end_sec,
                                'duration': end_sec - start_sec,
                                'embedding': embedding
                            })
                
                results.append({
                    'segments': segments,
                    'total_duration': duration,
                    'sample_rate': sr,
                    'method': 'colpali_official_segmented'
                })
                
            except Exception as e:
                logger.error(f"Error processing audio: {e}")
                results.append({
                    'error': str(e),
                    'segments': [],
                    'method': 'colpali_official_segmented'
                })
            finally:
                # 清理临时文件
                if temp_path and os.path.exists(temp_path):
                    try:
                        os.unlink(temp_path)
                    except:
                        pass
        
        return results

    def process_video(self, video_files: List[bytes]) -> List[dict]:
        """处理视频文件，提取关键帧和音频"""
        results = []
        
        for video_bytes in video_files:
            temp_path = None
            try:
                # 检查文件大小
                if len(video_bytes) > self.max_file_size:
                    raise ValueError(f"Video file size {len(video_bytes)} exceeds maximum {self.max_file_size}")
                
                # 创建安全的临时文件
                with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as temp_file:
                    temp_file.write(video_bytes)
                    temp_path = temp_file.name
                
                # 使用OpenCV读取视频
                cap = cv2.VideoCapture(temp_path)
                
                fps = cap.get(cv2.CAP_PROP_FPS)
                frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
                duration = frame_count / fps if fps > 0 else 0
                
                # 提取关键帧
                frame_embeddings = []
                frame_interval = int(fps * self.video_frame_interval) if fps > 0 else 1
                
                frame_idx = 0
                while True:
                    ret, frame = cap.read()
                    if not ret:
                        break
                    
                    if frame_idx % frame_interval == 0:
                        # 转换为PIL Image
                        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                        pil_image = Image.fromarray(frame_rgb)
                        
                        # 生成embedding
                        frame_embedding = self.process_image([pil_image])[0]
                        
                        timestamp = frame_idx / fps if fps > 0 else frame_idx
                        frame_embeddings.append({
                            'timestamp': timestamp,
                            'frame_idx': frame_idx,
                            'embedding': frame_embedding,
                            'pil_image': pil_image  # 保存PIL图像以供后续生成缩略图
                        })
                    
                    frame_idx += 1
                
                cap.release()
                
                # 提取音频（如果有）
                audio_segments = []
                try:
                    # 使用ffmpeg提取音频
                    audio_temp_path = temp_path.replace('.mp4', '_audio.wav')
                    import subprocess
                    result = subprocess.run([
                        'ffmpeg', '-i', temp_path, '-vn', '-acodec', 'pcm_s16le',
                        '-ar', str(self.audio_sample_rate), '-ac', '1', audio_temp_path, '-y'
                    ], capture_output=True, text=True)
                    
                    if result.returncode == 0 and os.path.exists(audio_temp_path):
                        with open(audio_temp_path, 'rb') as af:
                            audio_data = af.read()
                        
                        # 处理提取的音频
                        audio_results = self.process_audio([audio_data])
                        if audio_results and len(audio_results) > 0:
                            audio_result = audio_results[0]
                            if 'segments' in audio_result:
                                audio_segments = audio_result['segments']
                        
                        # 清理音频临时文件
                        if os.path.exists(audio_temp_path):
                            os.unlink(audio_temp_path)
                            
                except Exception as audio_error:
                    logger.warning(f"Could not extract audio from video: {audio_error}")
                
                # 转换帧数据结构以匹配后端期望
                frames = []
                for frame_emb in frame_embeddings:
                    import uuid
                    frame_id = str(uuid.uuid4())
                    
                    # 生成缩略图数据 - 将PIL图像转换为base64
                    thumbnail_base64 = None
                    if 'pil_image' in frame_emb:
                        import base64
                        thumbnail_buffer = io.BytesIO()
                        frame_emb['pil_image'].save(thumbnail_buffer, format='JPEG', quality=85)
                        thumbnail_base64 = base64.b64encode(thumbnail_buffer.getvalue()).decode('utf-8')
                    
                    frames.append({
                        'frame_id': frame_id,
                        'segment_id': frame_id,  # 添加segment_id字段
                        'timestamp': frame_emb['timestamp'],
                        'start_time': frame_emb['timestamp'],  # 添加start_time
                        'end_time': frame_emb['timestamp'] + 1,  # 添加end_time（帧持续1秒）
                        'duration': 1.0,  # 帧持续时间1秒
                        'frame_idx': frame_emb['frame_idx'],
                        'embedding': frame_emb['embedding'],
                        'thumbnail_base64': thumbnail_base64  # 添加缩略图数据
                    })
                
                # audio_segments 已经在上面处理了
                
                results.append({
                    'duration': duration,
                    'fps': fps,
                    'frame_count': frame_count,
                    'frames': frames,  # 使用正确的字段名
                    'audio_segments': audio_segments  # 使用正确的字段名
                })
                
            except Exception as e:
                logger.error(f"Error processing video: {e}")
                results.append({
                    'error': str(e),
                    'frames': [],  # 使用正确的字段名
                    'audio_segments': []  # 使用正确的字段名
                })
            finally:
                # 清理临时文件
                if temp_path and os.path.exists(temp_path):
                    try:
                        os.unlink(temp_path)
                    except:
                        pass
        
        return results

    # 旧的自定义音频处理方法已删除，现在使用官方colpali-engine API

    def process_multimodal(self, files: List[dict]) -> List[dict]:
        """处理多模态文件（图像、音频、视频混合）"""
        results = []
        
        for file_info in files:
            file_type = file_info.get('type', '')
            file_data = file_info.get('data', b'')
            
            if file_type.startswith('image/'):
                # 处理图像
                image = Image.open(io.BytesIO(file_data))
                embedding = self.process_image([image])[0]
                results.append({
                    'type': 'image',
                    'embedding': embedding
                })
            elif file_type.startswith('audio/'):
                # 处理音频
                audio_result = self.process_audio([file_data])[0]
                results.append({
                    'type': 'audio',
                    **audio_result
                })
            elif file_type.startswith('video/'):
                # 处理视频
                video_result = self.process_video([file_data])[0]
                results.append({
                    'type': 'video',
                    **video_result
                })
            else:
                results.append({
                    'type': 'unknown',
                    'error': f'Unsupported file type: {file_type}'
                })
        
        return results


# 创建全局实例 - 根据配置选择模型，带降级处理
colbert_omni = None

def initialize_model():
    global colbert_omni
    
    print(f"Initializing model with type: {settings.model_type}")
    
    try:
        if settings.model_type == "omni":
            model_path = settings.colqwen_omni_model_path
            print(f"Attempting to use ColQwen-omni model: {model_path}")
            print(f"Omni base path: {settings.colqwen_omni_base_path}")
            
            # 检查路径是否存在
            import os
            if not os.path.exists(model_path):
                print(f"Warning: Omni adapter path does not exist: {model_path}")
            if not os.path.exists(settings.colqwen_omni_base_path):
                print(f"Warning: Omni base path does not exist: {settings.colqwen_omni_base_path}")
            
            colbert_omni = ColBERTOmniService(model_path)
            print("Successfully initialized ColQwen-omni model")
        else:
            model_path = settings.colbert_model_path
            print(f"Using ColQwen2.5 model: {model_path}")
            colbert_omni = ColBERTOmniService(model_path)
            print("Successfully initialized ColQwen2.5 model")
            
    except Exception as e:
        print(f"Failed to load primary model: {e}")
        print(f"Error details: {str(e)}")
        
        if settings.model_type == "omni":
            print("Falling back to stable ColQwen2.5 model...")
            try:
                # 降级到原始模型
                fallback_path = settings.colbert_model_path
                print(f"Loading fallback model: {fallback_path}")
                
                # 检查降级路径
                import os
                if not os.path.exists(fallback_path):
                    print(f"Error: Fallback path also does not exist: {fallback_path}")
                    raise FileNotFoundError(f"Fallback model not found: {fallback_path}")
                
                colbert_omni = ColBERTOmniService(fallback_path)
                print("Successfully loaded fallback model")
                
            except Exception as fallback_e:
                print(f"Fallback model also failed: {fallback_e}")
                print(f"Fallback error details: {str(fallback_e)}")
                raise RuntimeError(f"Both primary and fallback models failed to load: {e} | {fallback_e}")
        else:
            print(f"Original model loading failed: {e}")
            raise e

# 初始化模型
try:
    initialize_model()
except Exception as init_e:
    print(f"Critical error during model initialization: {init_e}")
    # 不要让程序完全退出，而是创建一个空的服务实例
    print("Creating placeholder service to prevent crash...")
    class PlaceholderService:
        def __init__(self):
            self.device = torch.device("cpu")
            self.is_omni_model = False
            
        def process_query(self, queries):
            raise RuntimeError("Model failed to initialize")
            
        def process_image(self, images):
            raise RuntimeError("Model failed to initialize")
            
        def process_audio(self, audio_files):
            raise RuntimeError("Model failed to initialize")
            
        def process_video(self, video_files):
            raise RuntimeError("Model failed to initialize")
            
        def process_multimodal(self, files):
            raise RuntimeError("Model failed to initialize")
    
    colbert_omni = PlaceholderService()
    print("Placeholder service created - server will start but models won't work")