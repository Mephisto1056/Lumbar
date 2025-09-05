#!/bin/sh
set -e

echo "检查模型权重..."
BASE_MODEL="colqwen2.5-base"
ADAPTER_MODEL="colqwen2.5-v0.2"
OMNI_MODEL="colqwen-omni-v0.1"
OMNI_BASE_MODEL="colqwen2.5omni-base"

# 使用相对路径（因为WORKDIR=/model_weights）
MODEL_DIR="."  # 当前目录就是/model_weights

# 检查基础模型
if [ -f "$MODEL_DIR/$BASE_MODEL/complete.layra" ] && [ -f "$MODEL_DIR/$BASE_MODEL/.git/HEAD" ]; then
    echo "基础模型已存在，跳过下载: $BASE_MODEL"
else
    echo "下载基础模型: $BASE_MODEL"
    # 明确指定克隆到当前目录的子目录
    git clone ${MODEL_BASE_URL}/$BASE_MODEL "$MODEL_DIR/$BASE_MODEL"
    touch "$MODEL_DIR/$BASE_MODEL/complete.layra"  # 使用相对路径
fi

# 检查适配器模型
if [ -f "$MODEL_DIR/$ADAPTER_MODEL/complete.layra" ] && [ -f "$MODEL_DIR/$ADAPTER_MODEL/.git/HEAD" ]; then
    echo "适配器模型已存在，跳过下载: $ADAPTER_MODEL"
else
    echo "下载适配器模型: $ADAPTER_MODEL"
    git clone ${MODEL_BASE_URL}/$ADAPTER_MODEL "$MODEL_DIR/$ADAPTER_MODEL"
    touch "$MODEL_DIR/$ADAPTER_MODEL/complete.layra"
fi

# 检查全模态基础模型 (ColQwen2.5-omni-base)
if [ -f "$MODEL_DIR/$OMNI_BASE_MODEL/complete.layra" ] && [ -f "$MODEL_DIR/$OMNI_BASE_MODEL/.git/HEAD" ]; then
    echo "全模态基础模型已存在，跳过下载: $OMNI_BASE_MODEL"
else
    echo "下载全模态基础模型: $OMNI_BASE_MODEL"
    git clone ${MODEL_BASE_URL}/$OMNI_BASE_MODEL "$MODEL_DIR/$OMNI_BASE_MODEL"
    touch "$MODEL_DIR/$OMNI_BASE_MODEL/complete.layra"
fi

# 检查全模态适配器模型 (ColQwen-omni)
if [ -f "$MODEL_DIR/$OMNI_MODEL/complete.layra" ] && [ -f "$MODEL_DIR/$OMNI_MODEL/.git/HEAD" ]; then
    echo "全模态适配器模型已存在，跳过下载: $OMNI_MODEL"
else
    echo "下载全模态适配器模型: $OMNI_MODEL"
    git clone ${MODEL_BASE_URL}/$OMNI_MODEL "$MODEL_DIR/$OMNI_MODEL"
    touch "$MODEL_DIR/$OMNI_MODEL/complete.layra"
fi

# 配置适配器路径
echo "配置适配器路径..."

# 配置原有适配器
CONFIG_FILE="$MODEL_DIR/$ADAPTER_MODEL/adapter_config.json"
if [ -f "$CONFIG_FILE" ]; then
    # 使用jq更新路径（仍用绝对路径）
    jq --arg base_path "/model_weights/$BASE_MODEL" \
       '.base_model_name_or_path = $base_path' \
       "$CONFIG_FILE" > temp.json && mv temp.json "$CONFIG_FILE"
    
    echo "原有适配器配置更新完成:"
    cat "$CONFIG_FILE" | jq '.base_model_name_or_path'
else
    echo "警告: 找不到原有适配器 adapter_config.json 文件"
fi

# 配置全模态适配器
OMNI_CONFIG_FILE="$MODEL_DIR/$OMNI_MODEL/adapter_config.json"
if [ -f "$OMNI_CONFIG_FILE" ]; then
    # 使用jq更新全模态适配器路径
    jq --arg base_path "/model_weights/$OMNI_BASE_MODEL" \
       '.base_model_name_or_path = $base_path' \
       "$OMNI_CONFIG_FILE" > temp.json && mv temp.json "$OMNI_CONFIG_FILE"
    
    echo "全模态适配器配置更新完成:"
    cat "$OMNI_CONFIG_FILE" | jq '.base_model_name_or_path'
else
    echo "警告: 找不到全模态适配器 adapter_config.json 文件"
fi

# 检查模型类型配置
echo "检查模型类型配置: $MODEL_TYPE"
if [ "$MODEL_TYPE" = "omni" ]; then
    echo "将使用全模态模型: $OMNI_BASE_MODEL + $OMNI_MODEL"
else
    echo "将使用原有模型: $BASE_MODEL + $ADAPTER_MODEL"
fi

echo "✅ 模型权重初始化完成"
echo "可用模型:"
echo "- 原有模型: $BASE_MODEL + $ADAPTER_MODEL"
echo "- 全模态基础模型: $OMNI_BASE_MODEL"
echo "- 全模态适配器: $OMNI_MODEL"