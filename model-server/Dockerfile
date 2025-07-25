# 使用 CUDA 基础镜像 + 手动安装 PyTorch 2.6.0
FROM nvidia/cuda:12.4.0-base-ubuntu22.04

# 设置时区
ENV TZ=Asia/Shanghai
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# 替换为阿里云镜像源
RUN sed -i 's@//.*archive.ubuntu.com@//mirrors.aliyun.com@g' /etc/apt/sources.list && \
    sed -i 's@//.*security.ubuntu.com@//mirrors.aliyun.com@g' /etc/apt/sources.list

# 安装系统依赖
RUN apt-get update -o Acquire::Check-Valid-Until=false -o Acquire::AllowInsecureRepositories=true && \
    apt-get install -y --allow-unauthenticated \
    python3.10 \
    python3-pip \
    python3.10-venv \
    curl \
    netcat-openbsd \
    locales \
    ttf-wqy-zenhei \
    ttf-wqy-microhei \
    fonts-noto-cjk \
    fonts-noto-cjk-extra \
    git \
    build-essential \
    && rm -rf /var/lib/apt/lists/* && \
    localedef -i zh_CN -c -f UTF-8 -A /usr/share/locale/locale.alias zh_CN.UTF-8

# 设置中文环境
ENV LANG zh_CN.utf8

# 创建 Python 虚拟环境
RUN python3.10 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# 升级pip到最新版本
RUN pip install --upgrade pip setuptools wheel

WORKDIR /app

# 先复制 requirements.txt 以利用 Docker 缓存
COPY requirements.txt .

# 安装 PyTorch 相关依赖（使用官方源确保兼容性）
RUN pip install --no-cache-dir torch==2.6.0 torchvision==0.21.0 --index-url https://download.pytorch.org/whl/cu124

# 安装其他依赖（使用阿里云源加速）
RUN pip install --no-cache-dir -r requirements.txt -i https://mirrors.aliyun.com/pypi/simple/

# 验证安装
RUN python -c "import torch; print(f'PyTorch version: {torch.__version__}, CUDA: {torch.version.cuda}')" && \
    python -c "import transformers; print(f'Transformers version: {transformers.__version__}')"

# 复制项目文件
COPY . .

CMD ["python", "model_server.py"]