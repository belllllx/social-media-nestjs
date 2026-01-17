import { ICreateFileRecord } from "../types";

export function updateFileRecords(
  newFilesName: string[],
): Omit<ICreateFileRecord, 'contentId' | 'contentType'>[] {
  return newFilesName.map((file) => ({
    fileName: file,
  }));
}