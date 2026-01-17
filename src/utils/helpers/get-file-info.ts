export function getFileInfo(fileName: string) {
  const filesArr = fileName.split("/");
  return {
    fileDir: filesArr.shift()!,
    fileName: filesArr.pop()!,
  }
}