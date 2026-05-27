export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      documentos_expediente: {
        Row: {
          archivo_url: string
          created_at: string
          expediente_id: string
          id: string
          nombre: string
          tipo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archivo_url: string
          created_at?: string
          expediente_id: string
          id?: string
          nombre: string
          tipo: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archivo_url?: string
          created_at?: string
          expediente_id?: string
          id?: string
          nombre?: string
          tipo?: string
          updated_at?: string
          user_id?: string
        }
      }
      expedientes: {
        Row: {
          caratula: string
          cliente: string
          created_at: string
          descripcion: string | null
          estado: 'nuevo' | 'en_curso' | 'pendiente' | 'cerrado'
          fecha_inicio: string
          id: string
          numero: string
          updated_at: string
          user_id: string
        }
        Insert: {
          caratula: string
          cliente: string
          created_at?: string
          descripcion?: string | null
          estado?: 'nuevo' | 'en_curso' | 'pendiente' | 'cerrado'
          fecha_inicio?: string
          id?: string
          numero: string
          updated_at?: string
          user_id: string
        }
        Update: {
          caratula?: string
          cliente?: string
          created_at?: string
          descripcion?: string | null
          estado?: 'nuevo' | 'en_curso' | 'pendiente' | 'cerrado'
          fecha_inicio?: string
          id?: string
          numero?: string
          updated_at?: string
          user_id?: string
        }
      }
      notas_expediente: {
        Row: {
          contenido: string
          created_at: string
          expediente_id: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          contenido: string
          created_at?: string
          expediente_id: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          contenido?: string
          created_at?: string
          expediente_id?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
      }
    }
    Enums: {
      estado_expediente: 'nuevo' | 'en_curso' | 'pendiente' | 'cerrado'
    }
  }
}