FROM python:3.10-slim-bookworm

# 设置时区
ENV TZ=Asia/Shanghai
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# 完全替换为阿里云镜像源
RUN echo "deb http://mirrors.aliyun.com/debian bookworm main non-free non-free-firmware" > /etc/apt/sources.list && \
    echo "deb http://mirrors.aliyun.com/debian-security bookworm-security main non-free non-free-firmware" >> /etc/apt/sources.list && \
    echo "deb http://mirrors.aliyun.com/debian bookworm-updates main non-free non-free-firmware" >> /etc/apt/sources.list && \
    echo "deb http://mirrors.aliyun.com/debian bookworm-backports main non-free non-free-firmware" >> /etc/apt/sources.list

# 删除其他可能的源文件
RUN rm -rf /etc/apt/sources.list.d/*

# 安装系统依赖
RUN apt-get update -o Acquire::Check-Valid-Until=false -o Acquire::AllowInsecureRepositories=true && \
    apt-get install -y --allow-unauthenticated \
        poppler-utils \
        git \
        curl \
        docker.io \
        netcat-openbsd \
        locales \
        ttf-wqy-zenhei \
        ttf-wqy-microhei \
        fonts-noto-cjk \
        fonts-noto-cjk-extra \
        ffmpeg \
        libgl1-mesa-glx \
        libglib2.0-0 \
        libsm6 \
        libxext6 \
        libxrender1 \
        libgomp1 \
        libgstreamer1.0-0 \
        libavcodec-dev \
        libavformat-dev \
        libavutil-dev \
        libswscale-dev \
    && rm -rf /var/lib/apt/lists/* && \
    localedef -i zh_CN -c -f UTF-8 -A /usr/share/locale/locale.alias zh_CN.UTF-8

# 设置中文环境
ENV LANG zh_CN.utf8

# 添加 Docker 组并授予权限
# RUN groupadd docker && usermod -aG docker root

WORKDIR /app

# 先复制 requirements.txt 以利用 Docker 缓存
COPY requirements.txt .

# 使用国内PyPI镜像安装Python依赖
RUN pip install --no-cache-dir -i https://pypi.tuna.tsinghua.edu.cn/simple -r requirements.txt

# 复制项目文件
COPY . .

# 设置入口脚本
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# 创建沙箱共享目录
RUN mkdir -p /app/sandbox_workspace && chmod 777 /app/sandbox_workspace

ENTRYPOINT ["/entrypoint.sh"]