import { v4 as uuidv4 } from 'uuid';

export function genFilesName<T extends Express.Multer.File[] | Express.Multer.File>(
  files: T,
): T {
  if (!Array.isArray(files)) {
    const fileExt = files.originalname?.split('.').pop()!;
    const newFileName = `${uuidv4()}.${fileExt}`;
    return {
      ...files,
      filename: newFileName,
    } as T;
  }

  return files.map((file) => {
    const fileExt = file.originalname?.split('.').pop()!;
    const newFileName = `${uuidv4()}.${fileExt}`;
    return {
      ...file,
      filename: newFileName,
    };
  }) as T;
}
