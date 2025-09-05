export const getFileIcon = (fileExtension?: string) => {
  if (!fileExtension) return "📁";
  
  // 统一处理：移除开头的点，转换为小写
  const ext = fileExtension.replace(/^\./, '').toLowerCase();

  switch (ext) {
    // 图片类型
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'bmp':
    case 'webp':
    case 'svg':
    case 'ico':
      return "🖼️";

    // PDF文档
    case 'pdf':
      return "📄";

    // Word文档
    case 'doc':
    case 'docx':
      return "📝";

    // PowerPoint文档
    case 'ppt':
    case 'pptx':
      return "📊";

    // Excel文档
    case 'xls':
    case 'xlsx':
      return "📈";

    // 文本文件
    case 'txt':
    case 'md':
    case 'rtf':
      return "📃";

    // 压缩文件
    case 'zip':
    case 'rar':
    case '7z':
    case 'tar':
    case 'gz':
      return "📦";

    // 代码文件
    case 'js':
    case 'ts':
    case 'jsx':
    case 'tsx':
      return "📜";
    case 'html':
    case 'htm':
      return "🌐";
    case 'css':
      return "🎨";
    case 'json':
      return "📋";

    // 音频文件
    case 'mp3':
    case 'wav':
    case 'flac':
    case 'aac':
    case 'ogg':
    case 'm4a':
    case 'wma':
      return "🎵";
    
    // 视频文件
    case 'mp4':
    case 'mov':
    case 'avi':
    case 'mkv':
    case 'wmv':
    case 'flv':
    case 'webm':
      return "🎬";

    // 默认文件图标
    default:
      return "📄";
  }
};

export const getFileExtension = (filename: string) => {
  return filename.split(".").pop()?.toLowerCase() || "";
};

export const base64Processor = {
  pattern: /data:image\/([a-z0-9+.-]+);base64,/gi,
  placeholder: "__BASE64_IMAGE_$1_PLACEHOLDER__",

  encode: function (str: string) {
    return str.replace(this.pattern, (match, subtype) => {
      return this.placeholder.replace("$1", subtype);
    });
  },

  decode: function (str: string) {
    // 分割占位符并转义静态部分
    const parts = this.placeholder.split(/\$1/g);
    const escapedParts = parts.map((part) =>
      part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    );
    // 拼接成完整正则表达式
    const regexStr = escapedParts.join("([a-z0-9+.-]+)");
    const reversePattern = new RegExp(regexStr, "gi");

    return str.replace(reversePattern, (full, subtype) => {
      return `data:image/${subtype};base64,`;
    });
  },
};

export const SupportUploadFormat =
  ".jpg,.jpeg,.png,.gif,.bmp,.webp,.ico,.png,.odm,.sgl,.odt,.ott,.sxw,.stw,.fodt,.xml,.docx,.docm,.dotx,.dotm,.doc,.dot,.wps,.pdb,.pdf,.hwp,.html,.htm,.lwp,.psw,.rft,.sdw,.vor,.txt,.wpd,.oth,.ods,.ots,.sxc,.stc,.fods,.xml,.xlsx,.xlsm,.xltm,.xltx,.xlsb,.xls,.xlc,.xlm,.xlw,.xlk,.sdc,.vor,.dif,.wk1,.wks,.123,.pxl,.wb2,.csv,.odp,.otp,.sti,.sxd,.fodp,.xml,.pptx,.pptm,.ppsx,.potm,.potx,.ppt,.pps,.pot,.sdd,.vor,.sdp,.odg,.otg,.sxd,.std,.sgv,.sda,.vor,.sdd,.cdr,.svg,.vsd,.vst,.html,.htm,.stw,.sxg,.odf,.sxm,.smf,.mml,.odb,.mp3,.wav,.flac,.aac,.ogg,.m4a,.wma,.mp4,.mov,.avi,.mkv,.wmv,.flv,.webm";

export const SupportFileFormat =
  ["jpg","jpeg","png","gif","bmp","webp","ico","png","odm","sgl","odt","ott","sxw","stw","fodt","xml","docx","docm","dotx","dotm","doc","dot","wps","pdb","pdf","hwp","html","htm","lwp","psw","rft","sdw","vor","txt","wpd","oth","ods","ots","sxc","stc","fods","xml","xlsx","xlsm","xltm","xltx","xlsb","xls","xlc","xlm","xlw","xlk","sdc","vor","dif","wk1","wks","123","pxl","wb2","csv","odp","otp","sti","sxd","fodp","xml","pptx","pptm","ppsx","potm","potx","ppt","pps","pot","sdd","vor","sdp","odg","otg","sxd","std","sgv","sda","vor","sdd","cdr","svg","vsd","vst","html","htm","stw","sxg","odf","sxm","smf","mml","odb","mp3","wav","flac","aac","ogg","m4a","wma","mp4","mov","avi","mkv","wmv","flv","webm"];

// 媒体类型检测函数
export const getMediaType = (filename: string): 'image' | 'audio' | 'video' | 'document' => {
  const ext = getFileExtension(filename);
  
  // 音频格式
  const audioFormats = ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma'];
  if (audioFormats.includes(ext)) {
    return 'audio';
  }
  
  // 视频格式
  const videoFormats = ['mp4', 'mov', 'avi', 'mkv', 'wmv', 'flv', 'webm'];
  if (videoFormats.includes(ext)) {
    return 'video';
  }
  
  // 图像格式
  const imageFormats = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico'];
  if (imageFormats.includes(ext)) {
    return 'image';
  }
  
  // 默认为文档
  return 'document';
};

// 支持的音频格式
export const SupportedAudioFormats = ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma'];

// 支持的视频格式
export const SupportedVideoFormats = ['mp4', 'mov', 'avi', 'mkv', 'wmv', 'flv', 'webm'];

// 文件大小格式化
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// 音视频时长格式化
export const formatDuration = (seconds: number): string => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  } else {
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
};