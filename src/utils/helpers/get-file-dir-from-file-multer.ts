import { FileDir } from "../types";

export function getFileDirFromFileMulter(
  file: Express.Multer.File,
  type: 'post' | 'comment' | 'reply' | 'chat',
): FileDir {
  switch(type){
    case 'post':
      return file.mimetype.startsWith('image') ? 'post-image' : 'post-video';
    case 'comment':
      return 'comment-image';
    case 'reply':
      return 'reply-image';
    default: 
      return file.mimetype.startsWith('image') ? 'chat-image' : 'chat-video';
  }  
}
