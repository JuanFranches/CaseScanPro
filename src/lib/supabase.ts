import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

const supabaseUrl = 'https://hakzzmwsookcnzytejyb.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhha3p6bXdzb29rY256eXRlanliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1ODQ4OTMsImV4cCI6MjA5MTE2MDg5M30.-VAk8ewIibtLIh8rqxhzfILYPv0ZI18GTLJUfaFad4E';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});