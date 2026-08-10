import { useRef, useState, type ChangeEvent } from 'react'

const ACCEPTED_FILE_TYPES = '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.md'
const MAX_FILES = 20

interface ReferenceFilePickerProps {
  files: File[]
  disabled?: boolean
  onFilesChange: (files: File[]) => void
}

export default function ReferenceFilePicker({ files, disabled = false, onFilesChange }: ReferenceFilePickerProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [selectionError, setSelectionError] = useState('')

  const handlePick = () => {
    inputRef.current?.click()
  }

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || [])
    const merged = [...files, ...selected].filter(
      (file, index, all) => all.findIndex((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified) === index
    )
    if (merged.length > MAX_FILES) {
      setSelectionError(`一次最多选择 ${MAX_FILES} 个文件，当前已保留前 ${MAX_FILES} 个。`)
    } else {
      setSelectionError('')
    }
    onFilesChange(merged.slice(0, MAX_FILES))
    event.target.value = ''
  }

  const handleClear = () => {
    if (inputRef.current) inputRef.current.value = ''
    onFilesChange([])
    setSelectionError('')
  }

  const handleRemove = (index: number) => {
    onFilesChange(files.filter((_, fileIndex) => fileIndex !== index))
    setSelectionError('')
  }

  return (
    <div className={`file-picker-shell reference-file-picker${files.length ? ' has-file' : ''}`}>
      <input
        ref={inputRef}
        className="native-file-input reference-file-native-input"
        type="file"
        multiple
        accept={ACCEPTED_FILE_TYPES}
        disabled={disabled}
        onChange={handleChange}
      />
      <button className="file-pick-button" type="button" disabled={disabled} onClick={handlePick}>
        <span className="button-scan" aria-hidden="true" />
        选择文件
      </button>
      <div className="file-state-text" aria-live="polite">
        {files.length ? `已选择 ${files.length}/${MAX_FILES} 个文件` : `未选择文件（最多 ${MAX_FILES} 个）`}
      </div>
      {files.length ? (
        <button className="file-clear-button" type="button" disabled={disabled} onClick={handleClear}>
          清除
        </button>
      ) : null}
      {files.length ? (
        <ul className="reference-file-list" aria-label="已选择的参考文件">
          {files.map((file, index) => (
            <li key={`${file.name}-${file.size}-${file.lastModified}`}>
              <span>{file.name}</span>
              <button type="button" disabled={disabled} onClick={() => handleRemove(index)} aria-label={`移除 ${file.name}`}>
                移除
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {selectionError ? <p className="reference-file-error" role="alert">{selectionError}</p> : null}
    </div>
  )
}
