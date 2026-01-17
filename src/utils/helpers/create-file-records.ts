import { ContentType } from 'generated/prisma';
import { ICreateFileRecord } from '../types';
import { getFileDirFromFileMulter } from './get-file-dir-from-file-multer';

export function createFileRecords(
  newFilesName: Express.Multer.File[],
  contentType: ContentType,
  contentId?: string,
): ICreateFileRecord[] {
  return newFilesName.map((file) => {
    const fileDir = getFileDirFromFileMulter(file, "post");

    return {
      fileName: `${fileDir}/${file.filename}`,
      contentId,
      contentType,
    };
  });
}
