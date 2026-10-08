import { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { searchStudents } from '../services/attendance';
import type { StudentSearchResult } from '../types';
import StatusBadge from './StatusBadge';

interface Props {
  onStudentSelect: (studentId: string) => void;
}

export default function SearchBar({ onStudentSelect }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StudentSearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.trim().length < 1) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const data = await searchStudents(query.trim());
        setResults(data.slice(0, 8));
        setIsOpen(true);
      } catch {
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleSelect(student: StudentSearchResult) {
    setQuery('');
    setIsOpen(false);
    onStudentSelect(student.id);
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-xl">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setIsOpen(false)}
          placeholder='Buscar alumno, grupo (p. ej. "1-A") o grado…'
          className="w-full pl-9 pr-11 py-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-700
            placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setIsOpen(false); }}
            aria-label="Borrar búsqueda"
            className="absolute right-0 top-0 w-11 h-full flex items-center justify-center text-slate-400 hover:text-slate-600"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white rounded-lg border border-slate-200 shadow-lg overflow-hidden">
          {isLoading ? (
            <p className="px-4 py-3 text-sm text-slate-400">Buscando…</p>
          ) : results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-400">No se encontraron alumnos.</p>
          ) : (
            <ul>
              {results.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => handleSelect(s)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3
                      hover:bg-blue-50 text-left transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-800">{s.name}</p>
                      <p className="text-xs text-slate-400">
                        Grupo {s.grade}-{s.group}
                      </p>
                    </div>
                    <StatusBadge status={s.currentStatus} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
