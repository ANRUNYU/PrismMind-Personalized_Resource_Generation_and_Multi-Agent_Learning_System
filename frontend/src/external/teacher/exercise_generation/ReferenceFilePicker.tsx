import { useRef } from 'react'

const ACCEPTED_FILE_TYPES = '.pdf,.doc,.docx,.txt,.md,.ppt,.pptx'

export default function ReferenceFilePicker({
  files,
  disabled,
  onFilesChange
}: {
  files: File[]
  disabled: boolean
  onFilesChange: (files: File[]) => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)

  const handleChooseFile = () => {
    inputRef.current?.click()
  }

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onFilesChange(Array.from(event.target.files || []))
  }

  const handleClearFile = () => {
    if (inputRef.current) {
      inputRef.current.value = ''
    }

    onFilesChange([])
  }

  return (
    <div className="reference-file-picker">
      <input
        ref={inputRef}
        className="reference-file-native-input"
        type="file"
        multiple
        accept={ACCEPTED_FILE_TYPES}
        disabled={disabled}
        onChange={handleInputChange}
      />
      <div className={`reference-file-shell${files.length ? ' has-file' : ''}`}>
        <button className="reference-file-button" type="button" disabled={disabled} onClick={handleChooseFile}>
          选择文件
          <span className="file-button-scan" aria-hidden="true" />
        </button>
        <span className="reference-file-status">{files.length ? `已选择 ${files.length} 个文件：${files.map((file) => file.name).join('、')}` : '未选择文件'}</span>
        {files.length ? (
          <button className="reference-file-clear" type="button" disabled={disabled} onClick={handleClearFile}>
            清除
          </button>
        ) : null}
      </div>
    </div>
  )
}
