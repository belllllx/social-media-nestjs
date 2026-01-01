import { ContentType } from "generated/prisma";
import { ICreateFileRecord } from "../types";

export function createFileRecords(
  newFilesName: string[],
  contentType: ContentType,
  contentId?: string,
): ICreateFileRecord[] {
  return newFilesName.map((file) => ({
    fileUrl: file,
    contentId,
    contentType,
  }));
}