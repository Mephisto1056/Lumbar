from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # 模型路径配置
    colbert_model_path: str = "/model_weights/colqwen2.5-v0.2"  # 原有模型
    colqwen_omni_model_path: str = "/model_weights/colqwen-omni-v0.1"  # 新的全模态适配器
    colqwen_omni_base_path: str = "/model_weights/colqwen2.5omni-base"  # 全模态基础模型
    
    # 音频处理配置
    audio_segment_duration: int = 30  # 音频分段时长(秒)
    max_audio_duration: int = 3600    # 最大音频时长(秒)
    audio_sample_rate: int = 16000    # 音频采样率
    
    # 视频处理配置
    video_frame_interval: int = 1     # 视频帧提取间隔(秒)
    max_video_duration: int = 7200    # 最大视频时长(秒)
    max_video_size: int = 1024 * 1024 * 1024  # 最大视频文件大小(1GB)
    
    # 支持的文件格式
    supported_audio_formats: str = "mp3,wav,flac,aac,ogg,m4a"
    supported_video_formats: str = "mp4,avi,mov,mkv,wmv,flv"
    supported_image_formats: str = "jpg,jpeg,png,bmp,gif,tiff,webp"
    
    # 模型选择：'original' 或 'omni'
    model_type: str = "omni"

    class Config:
        env_file = "../.env"


settings = Settings()
