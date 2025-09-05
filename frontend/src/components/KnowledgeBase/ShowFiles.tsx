import { Base, KnowledgeFile } from "@/types/types";
import { Dispatch, SetStateAction, useState } from "react";
import ConfirmDialog from "../ConfirmDialog";
import MediaPreview from "../MediaPreview/MediaPreview";
import { getFileIcon, getMediaType, formatFileSize, formatDuration } from "@/utils/file";

interface ShowFilesProps {
  files: KnowledgeFile[];
  onDownload: (file: KnowledgeFile) => Promise<void>;
  bases: Base[];
  pageSize: number;
  setPageSize: Dispatch<SetStateAction<number>>;
  currentPage: number;
  setCurrentPage: Dispatch<SetStateAction<number>>;
  totalFiles: number;
  ondeleteFile: (file: KnowledgeFile) => void;
}

const ShowFiles: React.FC<ShowFilesProps> = ({
  files,
  onDownload,
  bases,
  pageSize,
  setPageSize,
  currentPage,
  setCurrentPage,
  totalFiles,
  ondeleteFile,
}) => {
  const [showConfirmDeleteFile, setShowConfirmDeleteFile] = useState<{
    index: number;
    file: KnowledgeFile;
  } | null>(null);
  const [previewFile, setPreviewFile] = useState<KnowledgeFile | null>(null);

  const handleDeleteFile = (file: KnowledgeFile, index: number) => {
    setShowConfirmDeleteFile({ index, file }); // 显示单个对话框
  };

  const confirmDeleteFile = () => {
    if (showConfirmDeleteFile) {
      ondeleteFile(showConfirmDeleteFile.file);
      setShowConfirmDeleteFile(null); // 关闭对话框
    }
  };

  const cancelDeleteFile = () => {
    if (showConfirmDeleteFile) {
      setShowConfirmDeleteFile(null); // 关闭对话框
    }
  };

  const handleFileClick = (file: KnowledgeFile) => {
    const mediaType = file.media_type || getMediaType(file.filename);
    if (mediaType === 'audio' || mediaType === 'video') {
      setPreviewFile(file);
    } else {
      onDownload(file);
    }
  };

  return (
    <div className="flex flex-col w-full h-full">
      {/* 文件列表 */}
      <div className="flex-1 overflow-auto mb-4">
        {files.map((file, index) => {
          const mediaType = file.media_type || getMediaType(file.filename);
          const fileIcon = getFileIcon(file.filename.split('.').pop());
          
          return (
            <div
              key={index}
              className="flex items-center justify-between p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-200"
            >
              <div
                className="flex items-center justify-between w-[calc(100%-24px)]"
                onClick={() => handleFileClick(file)}
              >
                <div className="flex items-center flex-1 space-x-3">
                  {/* 文件图标 */}
                  <div className="text-2xl">{fileIcon}</div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{file.filename}</div>
                    <div className="text-sm text-gray-500">
                      {new Date(file.upload_time).toLocaleDateString()}
                      {file.kb_id &&
                        ` · Knowledge-Base: ${
                          bases.find((b) => b.baseId === file.kb_id)?.name
                        }`}
                      {/* 显示媒体信息 */}
                      {file.media_metadata && (
                        <>
                          {file.media_metadata.duration && (
                            <span className="ml-2">
                              · {formatDuration(file.media_metadata.duration)}
                            </span>
                          )}
                          {file.media_metadata.file_size && (
                            <span className="ml-2">
                              · {formatFileSize(file.media_metadata.file_size)}
                            </span>
                          )}
                          {file.media_metadata.resolution && (
                            <span className="ml-2">
                              · {file.media_metadata.resolution}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    
                    {/* 媒体类型标签 */}
                    {mediaType !== 'document' && (
                      <div className="mt-1">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          mediaType === 'audio' ? 'bg-purple-100 text-purple-800' :
                          mediaType === 'video' ? 'bg-blue-100 text-blue-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {mediaType.toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* 下载按钮 */}
                <div className="flex items-center space-x-2">
                  {(mediaType === 'audio' || mediaType === 'video') && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewFile(file);
                      }}
                      className="p-1 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 rounded"
                      title="Preview"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                      </svg>
                    </button>
                  )}
                  
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDownload(file);
                    }}
                    className="p-1 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 rounded"
                    title="Download"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="w-4 h-4"
                    >
                      <path
                        fillRule="evenodd"
                        d="M12 2.25a.75.75 0 01.75.75v11.69l3.22-3.22a.75.75 0 111.06 1.06l-4.5 4.5a.75.75 0 01-1.06 0l-4.5-4.5a.75.75 0 111.06-1.06l3.22 3.22V3a.75.75 0 01.75-.75zm-9 13.5a.75.75 0 01.75.75v2.25a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5V16.5a.75.75 0 011.5 0v2.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V16.5a.75.75 0 01.75-.75z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                </div>
              </div>
              
              {/* 删除按钮 */}
              <button
                onClick={() => handleDeleteFile(file, index)}
                className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded ml-2"
                title="Delete"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                  className="w-4 h-4"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                  />
                </svg>
              </button>
            </div>
          );
        })}
        
        {files.length === 0 && (
          <div className="text-center py-8 text-gray-500">No files found</div>
        )}
      </div>

      <div className="flex justify-between items-center mt-auto">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Show</span>
          <select
            className="border border-gray-300 rounded px-2 py-1 text-sm"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
          <span className="text-sm text-gray-600">files per page</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
          >
            Previous
          </button>
          <span className="text-sm text-gray-600">
            Page {currentPage} of {Math.ceil(totalFiles / pageSize)}
          </span>
          <button
            onClick={() => setCurrentPage(currentPage + 1)}
            disabled={currentPage >= Math.ceil(totalFiles / pageSize)}
            className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      {showConfirmDeleteFile && (
        <ConfirmDialog
          message={`Confirm the deletion of file "${showConfirmDeleteFile.file.filename.slice(
            0,
            20
          )}..."`}
          onConfirm={confirmDeleteFile}
          onCancel={cancelDeleteFile}
        />
      )}

      {/* 媒体预览弹窗 */}
      {previewFile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-4xl max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium truncate">{previewFile.filename}</h3>
              <button
                onClick={() => setPreviewFile(null)}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <MediaPreview
              url={previewFile.url}
              filename={previewFile.filename}
              mediaType={
                previewFile.media_type === 'audio' || previewFile.media_type === 'video'
                  ? previewFile.media_type
                  : undefined
              }
              className="w-full"
            />
            
            {/* 文件信息 */}
            {previewFile.media_metadata && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">File Information</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {previewFile.media_metadata.duration && (
                    <div>
                      <span className="text-gray-500">Duration:</span>
                      <span className="ml-2 font-medium">{formatDuration(previewFile.media_metadata.duration)}</span>
                    </div>
                  )}
                  {previewFile.media_metadata.file_size && (
                    <div>
                      <span className="text-gray-500">File Size:</span>
                      <span className="ml-2 font-medium">{formatFileSize(previewFile.media_metadata.file_size)}</span>
                    </div>
                  )}
                  {previewFile.media_metadata.resolution && (
                    <div>
                      <span className="text-gray-500">Resolution:</span>
                      <span className="ml-2 font-medium">{previewFile.media_metadata.resolution}</span>
                    </div>
                  )}
                  {previewFile.media_metadata.sample_rate && (
                    <div>
                      <span className="text-gray-500">Sample Rate:</span>
                      <span className="ml-2 font-medium">{previewFile.media_metadata.sample_rate} Hz</span>
                    </div>
                  )}
                  {previewFile.media_metadata.fps && (
                    <div>
                      <span className="text-gray-500">Frame Rate:</span>
                      <span className="ml-2 font-medium">{previewFile.media_metadata.fps} fps</span>
                    </div>
                  )}
                  {previewFile.media_metadata.format && (
                    <div>
                      <span className="text-gray-500">Format:</span>
                      <span className="ml-2 font-medium">{previewFile.media_metadata.format.toUpperCase()}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ShowFiles;
