import uuid
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.models.model_config import (
    ModelCreate,
    ModelUpdate,
    SelectedModelResponse,
    UpdateSelectedModelRequest,
)
from app.models.user import User
from app.core.security import (
    get_current_user,
    verify_username_match,
)
from app.db.mongo import get_mongo, MongoDB

router = APIRouter()


class ValidateApiKeyRequest(BaseModel):
    model_url: str
    api_key: str


@router.post("/validate-api-key")
async def validate_api_key(
    request: ValidateApiKeyRequest,
    current_user: User = Depends(get_current_user),
):
    """验证API Key是否可用"""
    try:
        # 使用OpenAI兼容API测试API Key有效性
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{request.model_url}/models",
                headers={"Authorization": f"Bearer {request.api_key}"}
            )
            
        if response.status_code == 200:
            models = response.json()
            if "data" in models and len(models["data"]) > 0:
                return {"valid": True, "message": "API Key有效"}
            else:
                return {"valid": False, "message": "API Key无效或无可用模型"}
        elif response.status_code == 401:
            return {"valid": False, "message": "API Key无效或已过期"}
        else:
            return {"valid": False, "message": f"验证失败，状态码: {response.status_code}"}
            
    except httpx.TimeoutException:
        return {"valid": False, "message": "连接超时，请检查URL是否正确"}
    except httpx.ConnectError:
        return {"valid": False, "message": "连接失败，请检查网络或URL"}
    except Exception as e:
        return {"valid": False, "message": f"验证过程中发生错误: {str(e)}"}


@router.post("/{username}", status_code=201)
async def add_model_config(
    username: str,
    model_data: ModelCreate,
    db: MongoDB = Depends(get_mongo),
    current_user: User = Depends(get_current_user),
):
    await verify_username_match(current_user, username)
    """添加新的模型配置"""
    model_id = username + "_" +str(uuid.uuid4())
    result = await db.add_model_config(username=username,model_id=model_id, **model_data.model_dump())

    if result["status"] == "error":
        if "already exists" in result["message"]:
            raise HTTPException(status_code=409, detail=result["message"])
        elif "User not found" in result["message"]:
            raise HTTPException(status_code=404, detail=result["message"])
        else:
            raise HTTPException(status_code=400, detail=result["message"])

    return {"message": "Model added successfully", "model_id": result["model_id"]}


@router.delete("/{username}/{model_id}")
async def delete_model_config(
    username: str,
    model_id: str,
    db: MongoDB = Depends(get_mongo),
    current_user: User = Depends(get_current_user),
):
    await verify_username_match(current_user, username)
    """删除指定模型配置"""
    result = await db.delete_model_config(username, model_id)

    if result["status"] == "error":
        if "User not found" in result["message"]:
            raise HTTPException(status_code=404, detail=result["message"])
        elif "Model ID not found" in result["message"]:
            raise HTTPException(status_code=404, detail=result["message"])

    return {"message": "Model deleted successfully"}


@router.patch("/{username}/{model_id}")
async def update_model_config(
    username: str,
    model_id: str,
    update_data: ModelUpdate,
    db: MongoDB = Depends(get_mongo),
    current_user: User = Depends(get_current_user),
):
    await verify_username_match(current_user, username)
    """更新模型配置（部分更新）"""
    result = await db.update_model_config(
        username=username, model_id=model_id, **update_data.model_dump(exclude_unset=True)
    )
    await db.update_selected_model(
            username=username, model_id=model_id
        )
    if result["status"] == "error":
        if "User not found" in result["message"]:
            raise HTTPException(status_code=404, detail=result["message"])
        else:
            raise HTTPException(status_code=400, detail=result["message"])

    return {"message": "Model updated successfully"}


@router.get("/{username}/selected", response_model=SelectedModelResponse)
async def get_selected_model(
    username: str,
    db: MongoDB = Depends(get_mongo),
    current_user: User = Depends(get_current_user),
):
    await verify_username_match(current_user, username)
    """获取用户选定的模型配置"""
    result = await db.get_selected_model_config(username)

    if result["status"] == "error":
        if "User not found" in result["message"]:
            raise HTTPException(status_code=404, detail=result["message"])
        elif "No selected model" in result["message"]:
            return {"status": "error", "message": result["message"]}

    return result


@router.get("/{username}/all", response_model=dict)
async def get_all_models(
    username: str,
    db: MongoDB = Depends(get_mongo),
    current_user: User = Depends(get_current_user),
):
    await verify_username_match(current_user, username)
    """获取用户所有模型配置"""
    result = await db.get_all_models_config(username)

    if result["status"] == "error":
        raise HTTPException(status_code=404, detail=result["message"])

    return result


@router.put("/{username}/select-model", status_code=200)
async def update_selected_model(
    username: str,
    request: UpdateSelectedModelRequest,
    db: MongoDB = Depends(get_mongo),
    current_user: User = Depends(get_current_user),
):
    await verify_username_match(current_user, username)
    """更新用户选定的模型"""
    result = await db.update_selected_model(
        username=username, model_id=request.model_id
    )

    if result["status"] == "error":
        if "User not found" in result["message"]:
            raise HTTPException(status_code=404, detail=result["message"])
        elif "not found" in result["message"]:
            raise HTTPException(status_code=400, detail=result["message"])

    return {
        "message": "Selected model updated successfully",
        "selected_model": result["selected_model"],
    }
