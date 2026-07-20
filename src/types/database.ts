export type WorkType = 'open' | 'middle' | 'close' | 'allday'
export type LeaveType = 'annual' | 'half' | 'substitute' | 'sick' | 'request'
export type ScheduleStatus = 'draft' | 'submitted' | 'approved' | 'rejected'
export type UserRole = 'admin' | 'user'
export type MemberStatus = 'pending' | 'approved' | 'rejected' | 'banned'
export type MemberRole = 'admin' | 'senior' | 'junior' | 'parttimer' | 'resigned'

export interface Profile {
  id: string
  display_name: string
  phone: string | null
  role: UserRole
  created_at: string
  updated_at: string
}

export interface Store {
  id: string
  name: string
  owner_id: string
  locked: boolean
  // 참고: DB의 stores.memo 컬럼(레거시 JSON 메모)은 복구용 백업으로만 보존 중이며
  // 앱에서는 store_memos 테이블을 사용합니다. 복구 완료 후 컬럼과 함께 제거 예정.
  created_at: string
}

export interface StoreMemo {
  id: string
  store_id: string
  month: string
  content: string
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface StoreMember {
  id: string
  store_id: string
  user_id: string
  status: MemberStatus
  role: MemberRole
  annual_leave: number
  resignation_date: string | null
  created_at: string
}

export interface Schedule {
  id: string
  store_id: string
  user_id: string
  date: string
  work_type: WorkType | null
  leave_type: LeaveType | null
  status: ScheduleStatus
  note: string | null
  created_at: string
  updated_at: string
}

export interface GhostSchedule {
  id: string
  store_id: string
  slot: number
  date: string
  work_type: WorkType | null
  leave_type: LeaveType | null
}

export interface MonthlyLock {
  month: string
  is_locked: boolean
  created_at: string
  updated_at: string
}

export interface Database {
  public: {
    Tables: {
      monthly_locks: {
        Row: MonthlyLock
        Insert: Omit<MonthlyLock, 'created_at' | 'updated_at'>
        Update: Partial<Omit<MonthlyLock, 'created_at'>>
      }
      profiles: {
        Row: Profile
        Insert: Omit<Profile, 'created_at' | 'updated_at'>
        Update: Partial<Omit<Profile, 'id' | 'created_at'>>
      }
      stores: {
        Row: Store
        Insert: Omit<Store, 'id' | 'created_at'>
        Update: Partial<Omit<Store, 'id' | 'created_at'>>
      }
      store_members: {
        Row: StoreMember
        Insert: Omit<StoreMember, 'id' | 'created_at'>
        Update: Partial<Omit<StoreMember, 'id' | 'created_at'>>
      }
      schedules: {
        Row: Schedule
        Insert: Omit<Schedule, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Schedule, 'id' | 'created_at'>>
      }
      store_memos: {
        Row: StoreMemo
        Insert: Omit<StoreMemo, 'id' | 'created_at' | 'updated_at'> & { id?: string }
        Update: Partial<Omit<StoreMemo, 'id' | 'created_at'>>
      }
    }
  }
}
