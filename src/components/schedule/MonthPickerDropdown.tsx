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
        className="inline-flex items-center justify-center gap-1 cursor-pointer hover:bg-slate-100 rounded-lg px-3 py-1.5 transition-all active:scale-95"
        onClick={() => setIsOpen(!isOpen)}
      >
        <h2 className="text-xl font-bold min-w-[100px] text-center select-none text-slate-900">
          {format(currentMonth, 'yyyy년 M월', { locale: ko })}
        </h2>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 bg-white border border-slate-200 shadow-2xl rounded-2xl p-4 w-72 select-none animate-in fade-in zoom-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between mb-5 px-1">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 hover:bg-slate-100 rounded-full"
              onClick={() => setViewYear(y => y - 1)}
            >
              <ChevronLeft className="h-5 w-5 text-slate-600" />
            </Button>
            <div className="font-extrabold text-lg text-slate-900">{viewYear}년</div>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 hover:bg-slate-100 rounded-full"
              onClick={() => setViewYear(y => y + 1)}
            >
              <ChevronRight className="h-5 w-5 text-slate-600" />
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {months.map(m => {
              const isSelected = viewYear === currentMonth.getFullYear() && m === currentMonth.getMonth()
              return (
                <div
                  key={m}
                  onClick={() => handleMonthSelect(m)}
                  className={`text-center py-2.5 rounded-xl cursor-pointer text-sm font-medium transition-all ${
                    isSelected 
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-200 scale-105' 
                      : 'hover:bg-slate-100 text-slate-600 hover:text-slate-900'
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
