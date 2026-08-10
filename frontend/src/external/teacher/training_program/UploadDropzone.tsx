import { useRef, useState, type DragEvent, type KeyboardEvent } from 'react'

const ACCEPTED_TYPES = '.pdf,.doc,.docx,.txt,.md,.ppt,.pptx'

interface UploadDropzoneProps {
  files: File[]
  disabled?: boolean
  onFilesChange: (files: File[]) => void
  onClear: () => void
}

export default function UploadDropzone({ files, disabled = false, onFilesChange, onClear }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const openFileDialog = () => {
    if (!disabled) {
      inputRef.current?.click()
    }
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFiles = Array.from(event.target.files || [])
    if (nextFiles.length) onFilesChange(nextFiles)
    event.target.value = ''
  }

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (!disabled) setIsDragging(true)
  }

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    if (disabled) return

    const nextFiles = Array.from(event.dataTransfer.files || [])
    if (nextFiles.length) onFilesChange(nextFiles)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openFileDialog()
    }
  }

  const clearFile = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    onClear()
  }

  return (
    <div className="training-upload-field">
      <div className="training-field-row">
        <span className="training-field-label">文件解析输入（可选）</span>
        <span className="training-field-hint">支持 PDF / Word / TXT / PPT 等课程材料</span>
      </div>

      <div
        className={`training-dropzone${isDragging ? ' is-dragging' : ''}${files.length ? ' has-file' : ''}${disabled ? ' is-disabled' : ''}`}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={openFileDialog}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onKeyDown={handleKeyDown}
      >
        <input
          ref={inputRef}
          className="training-file-native-input"
          type="file"
          multiple
          accept={ACCEPTED_TYPES}
          aria-label="上传培养方案相关文件"
          disabled={disabled}
          onChange={handleFileSelect}
        />
        <span className="training-upload-icon" aria-hidden="true">
          <i />
        </span>
        <span className="training-upload-main">点击或拖拽文件到此区域</span>
        <span className="training-upload-sub">可上传材料补充依据；不上传时将根据培养方案基本信息生成。</span>

        {files.length ? (
          <span className="training-file-chip">
            <span>{files.map((file) => file.name).join('、')}</span>
            <button type="button" disabled={disabled} onClick={clearFile} aria-label="清除已选文件">
              清除
            </button>
          </span>
        ) : null}
      </div>
    </div>
  )
}
