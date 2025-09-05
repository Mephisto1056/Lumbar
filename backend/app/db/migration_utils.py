"""
数据库迁移工具
用于安全地迁移现有数据到新的schema
"""
import logging
from typing import List, Dict, Any, Optional
from pymilvus import MilvusClient, DataType
from app.core.logging import logger
from app.db.milvus import MilvusManager

class DatabaseMigrationManager:
    """数据库迁移管理器"""
    
    def __init__(self, milvus_manager: MilvusManager):
        self.milvus_manager = milvus_manager
        self.client = milvus_manager.client
        
    def check_schema_compatibility(self, collection_name: str) -> Dict[str, Any]:
        """
        检查collection schema的兼容性
        
        Returns:
            包含兼容性信息的字典
        """
        try:
            if not self.client.has_collection(collection_name):
                return {
                    'exists': False,
                    'compatible': True,
                    'needs_migration': False,
                    'message': 'Collection does not exist, can create new'
                }
            
            # 获取collection信息
            collection_info = self.client.describe_collection(collection_name)
            
            # 检查是否有新字段
            existing_fields = [field['name'] for field in collection_info['fields']]
            required_new_fields = ['media_type', 'timestamp_start', 'timestamp_end', 'duration', 'segment_id']
            
            missing_fields = [field for field in required_new_fields if field not in existing_fields]
            
            if missing_fields:
                return {
                    'exists': True,
                    'compatible': False,
                    'needs_migration': True,
                    'missing_fields': missing_fields,
                    'message': f'Collection exists but missing fields: {missing_fields}'
                }
            else:
                return {
                    'exists': True,
                    'compatible': True,
                    'needs_migration': False,
                    'message': 'Collection is compatible with new schema'
                }
                
        except Exception as e:
            logger.error(f"Error checking schema compatibility for {collection_name}: {e}")
            return {
                'exists': False,
                'compatible': False,
                'needs_migration': False,
                'error': str(e),
                'message': f'Error checking compatibility: {e}'
            }
    
    def safe_migrate_collection(self, collection_name: str, dim: int = 128, backup: bool = True) -> Dict[str, Any]:
        """
        安全地迁移collection到新schema
        
        Args:
            collection_name: collection名称
            dim: 向量维度
            backup: 是否创建备份
            
        Returns:
            迁移结果
        """
        migration_result = {
            'success': False,
            'backup_created': False,
            'data_migrated': False,
            'records_processed': 0,
            'errors': []
        }
        
        try:
            # 检查兼容性
            compatibility = self.check_schema_compatibility(collection_name)
            
            if not compatibility['needs_migration']:
                logger.info(f"Collection {collection_name} does not need migration")
                migration_result['success'] = True
                migration_result['message'] = compatibility['message']
                return migration_result
            
            # 备份现有数据
            backup_data = None
            if backup and compatibility['exists']:
                logger.info(f"Creating backup for collection {collection_name}")
                backup_data = self._create_safe_backup(collection_name)
                migration_result['backup_created'] = backup_data is not None
                
                if backup_data:
                    logger.info(f"Backup created with {len(backup_data)} records")
                else:
                    logger.warning("Failed to create backup, proceeding without backup")
            
            # 执行迁移
            if compatibility['exists']:
                # 删除现有collection
                self.client.drop_collection(collection_name)
                logger.info(f"Dropped existing collection {collection_name}")
            
            # 创建新collection
            self.milvus_manager.create_collection(collection_name, dim, migrate_existing=False)
            logger.info(f"Created new collection {collection_name} with updated schema")
            
            # 恢复数据
            if backup_data:
                migrated_count = self._restore_with_new_schema(collection_name, backup_data)
                migration_result['data_migrated'] = True
                migration_result['records_processed'] = migrated_count
                logger.info(f"Migrated {migrated_count} records to new schema")
            
            migration_result['success'] = True
            migration_result['message'] = f"Successfully migrated collection {collection_name}"
            
        except Exception as e:
            error_msg = f"Migration failed for collection {collection_name}: {e}"
            logger.error(error_msg)
            migration_result['errors'].append(error_msg)
            migration_result['message'] = error_msg
        
        return migration_result
    
    def _create_safe_backup(self, collection_name: str) -> Optional[List[Dict]]:
        """创建安全备份"""
        try:
            # 分批查询以避免内存问题
            all_data = []
            offset = 0
            batch_size = 1000
            
            while True:
                batch_data = self.client.query(
                    collection_name=collection_name,
                    filter="",
                    output_fields=["*"],
                    limit=batch_size,
                    offset=offset
                )
                
                if not batch_data:
                    break
                
                all_data.extend(batch_data)
                offset += len(batch_data)
                
                # 防止无限循环
                if len(batch_data) < batch_size:
                    break
            
            return all_data
            
        except Exception as e:
            logger.error(f"Failed to create backup for {collection_name}: {e}")
            return None
    
    def _restore_with_new_schema(self, collection_name: str, backup_data: List[Dict]) -> int:
        """使用新schema恢复数据"""
        migrated_count = 0
        batch_size = 100
        
        try:
            # 分批处理数据
            for i in range(0, len(backup_data), batch_size):
                batch = backup_data[i:i + batch_size]
                migrated_batch = []
                
                for record in batch:
                    # 转换旧记录到新schema
                    migrated_record = {
                        "vector": record.get("vector"),
                        "image_id": record.get("image_id"),
                        "page_number": record.get("page_number", 0),
                        "file_id": record.get("file_id"),
                        # 为旧数据添加新字段的默认值
                        "media_type": record.get("media_type", "image"),
                        "timestamp_start": record.get("timestamp_start", 0.0),
                        "timestamp_end": record.get("timestamp_end", 0.0),
                        "duration": record.get("duration", 0.0),
                        "segment_id": record.get("segment_id", "")
                    }
                    migrated_batch.append(migrated_record)
                
                # 插入批量数据
                if migrated_batch:
                    self.client.insert(collection_name, migrated_batch)
                    migrated_count += len(migrated_batch)
                    
                    if migrated_count % 1000 == 0:
                        logger.info(f"Migrated {migrated_count} records...")
            
            return migrated_count
            
        except Exception as e:
            logger.error(f"Failed to restore data for {collection_name}: {e}")
            raise
    
    def validate_migration(self, collection_name: str, expected_count: int = None) -> Dict[str, Any]:
        """验证迁移结果"""
        try:
            if not self.client.has_collection(collection_name):
                return {
                    'success': False,
                    'message': 'Collection does not exist after migration'
                }
            
            # 检查记录数
            stats = self.client.get_collection_stats(collection_name)
            actual_count = stats.get('row_count', 0)
            
            result = {
                'success': True,
                'record_count': actual_count,
                'message': f'Migration validation passed, {actual_count} records found'
            }
            
            if expected_count is not None:
                if actual_count != expected_count:
                    result['success'] = False
                    result['message'] = f'Record count mismatch: expected {expected_count}, got {actual_count}'
            
            return result
            
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'message': f'Validation failed: {e}'
            }


def perform_safe_migration(collection_name: str, dim: int = 128) -> Dict[str, Any]:
    """
    执行安全迁移的便捷函数
    
    Args:
        collection_name: collection名称
        dim: 向量维度
        
    Returns:
        迁移结果
    """
    from app.db.milvus import milvus_client
    
    migration_manager = DatabaseMigrationManager(milvus_client)
    
    # 执行迁移
    result = migration_manager.safe_migrate_collection(collection_name, dim, backup=True)
    
    # 验证迁移
    if result['success']:
        validation = migration_manager.validate_migration(collection_name)
        result['validation'] = validation
    
    return result