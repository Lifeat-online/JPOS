import React, { useState, useRef, useEffect } from 'react';
import { Search, UserPlus, Users, X, ChevronDown, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Customer } from '../types';

interface CustomerSelectorProps {
  customers: Customer[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAddNew: () => void;
}

export function CustomerSelector({ customers, selectedId, onSelect, onAddNew }: CustomerSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedCustomer = customers.find(c => c.id === selectedId);

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    (c.phone && c.phone.includes(search)) ||
    (c.email && c.email.toLowerCase().includes(search.toLowerCase()))
  ).slice(0, 8); // Limit results for performance/UI

  useEffect(() => {
    if (isOpen) {
      setHighlightedIndex(-1);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex(prev => (prev < filteredCustomers.length - 1 ? prev + 1 : prev));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex(prev => (prev > -1 ? prev - 1 : prev));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (highlightedIndex === -1) {
          onSelect(null);
        } else if (filteredCustomers[highlightedIndex]) {
          onSelect(filteredCustomers[highlightedIndex].id);
        }
        setIsOpen(false);
      } else if (e.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredCustomers, highlightedIndex, onSelect]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative w-full" ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full h-[44px] lg:h-[50px] px-4 rounded-xl border flex items-center justify-between transition-all font-medium text-sm shadow-sm ${
          selectedCustomer 
            ? 'bg-primary/5 border-primary/20 text-primary' 
            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700/60 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
        }`}
      >
        <div className="flex items-center gap-3 truncate">
          <Users className={`w-4 h-4 shrink-0 ${selectedCustomer ? 'text-primary' : 'text-slate-400'}`} />
          <span className="truncate">
            {selectedCustomer ? selectedCustomer.name : 'Walk-in Customer'}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {selectedId && (
            <div 
              onClick={(e) => { e.stopPropagation(); onSelect(null); }}
              className="p-1 hover:bg-primary/10 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </div>
          )}
          <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 4, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute top-full left-0 right-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl z-[100] overflow-hidden"
          >
            <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Seach by name or phone..."
                  className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-medium transition-all text-slate-900 dark:text-white"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="max-h-[300px] overflow-y-auto no-scrollbar">
              <button
                onClick={() => {
                  onSelect(null);
                  setIsOpen(false);
                }}
                className={`w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors text-sm font-semibold ${!selectedId ? 'text-primary bg-primary/5' : 'text-slate-600 dark:text-slate-300'} ${highlightedIndex === -1 ? 'bg-slate-50 dark:bg-slate-800' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <Users className="w-4 h-4" />
                  </div>
                  <span>Guest Customer</span>
                </div>
                {!selectedId && <Check className="w-4 h-4" />}
              </button>

              {filteredCustomers.map((customer, index) => (
                <button
                  key={customer.id}
                  onClick={() => {
                    onSelect(customer.id);
                    setIsOpen(false);
                  }}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors text-left border-t border-slate-50 dark:border-slate-800/50 ${selectedId === customer.id ? 'bg-primary/5' : ''} ${highlightedIndex === index ? 'bg-slate-100/50 dark:bg-slate-800/50' : ''}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-black text-[10px]">
                      {customer.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <div className={`text-sm font-bold truncate ${selectedId === customer.id ? 'text-primary' : 'text-slate-800 dark:text-slate-100'}`}>
                        {customer.name}
                      </div>
                      <div className="text-[10px] text-slate-400 font-bold tracking-tight truncate">
                        {customer.phone || customer.email || 'No contact info'}
                      </div>
                    </div>
                  </div>
                  {selectedId === customer.id && <Check className="w-4 h-4 text-primary" />}
                </button>
              ))}

              {filteredCustomers.length === 0 && search && (
                <div className="p-8 text-center">
                  <p className="text-sm font-bold text-slate-400">No customers found</p>
                </div>
              )}
            </div>

            <div className="p-3 bg-slate-50 dark:bg-[#0B1120] border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => {
                  onAddNew();
                  setIsOpen(false);
                }}
                className="w-full py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 rounded-xl text-primary text-xs font-black flex items-center justify-center gap-2 hover:bg-primary hover:text-white hover:border-primary transition-all shadow-sm"
              >
                <UserPlus className="w-4 h-4" />
                CREATE NEW PROFILE
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
