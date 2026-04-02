import { useState, useRef, useEffect } from 'react'
import { format, setYear, setMonth } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface MonthPickerDropdownProps {
  currentMonth: Date
  onChange: (newMonth: Date) => void
}

export function MonthPickerDropdown({ currentMonth, onChange }: MonthPickerDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [viewYear, setViewYear] = useState(currentMonth.getFullYear())
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // currentMonth가 외부에서 바뀌면 viewYear도 동기화
  useEffect(() => {
    setViewYear(currentMonth.getFullYear())
  }, [currentMonth])

  const months = Array.from({ length: 12 }, (_, i) => i)

  const handleMonthSelect = (monthIndex: number) => {
    const newDate = setMonth(setYear(currentMonth, viewYear), monthIndex)
    onChange(newDate)
    setIsOpen(false)
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <div 
        className="inline-flex items-center justify-center gap-1 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md px-2 py-1 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <h2 className="text-lg font-semibold min-w-[90px] text-center select-none">
          {format(currentMonth, 'yyyy년 M월', { locale: ko })}
        </h2>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </div>

      {isOpen && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-50 bg-white dark:bg-slate-900 border shadow-lg rounded-xl p-3 w-64 select-none">
          <div className="flex items-center justify-between mb-4 px-1">
            <Button variant="ghost" size="sm" onClick={() => setViewYear(y => y - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="font-bold text-lg">{viewYear}년</div>
            <Button variant="ghost" size="sm" onClick={() => setViewYear(y => y + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {months.map(m => {
              const isSelected = viewYear === currentMonth.getFullYear() && m === currentMonth.getMonth()
              return (
                <div
                  key={m}
                  onClick={() => handleMonthSelect(m)}
                  className={`text-center py-2 rounded-md cursor-pointer text-sm transition-colors ${
                    isSelected 
                      ? 'bg-primary text-primary-foreground font-bold' 
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {m + 1}월
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
