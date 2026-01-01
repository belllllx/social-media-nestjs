import { v4 as uuidv4 } from 'uuid';

export function genFilesName(
  files: Express.Multer.File[],
): Express.Multer.File[] {
  return files.map((file) => {
    const fileExt = file.originalname?.split('.').pop()!;
    const newFileName = `${uuidv4()}.${fileExt}`;
    return {
      ...file,
      originalname: newFileName,
    };
  });
}
