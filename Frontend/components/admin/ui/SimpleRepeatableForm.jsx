'use client';

import { RepeatableList } from './RepeatableList';
import { ImageField } from './ImageField';
import { DocumentField } from './DocumentField';
import { LinkField } from './LinkField';

const inputClass = 'w-full rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-sm text-charcoal';

// Config-driven repeatable-item form, used across About/Our Work/Impact/
// Credibility/Join Us for the many sections that are all really the same
// shape: a list of items with some mix of text/textarea/image/document/link
// fields. `fields`: [{ key, label, type: 'text'|'textarea'|'image'|'document'|'link', placeholder? }]
export function SimpleRepeatableForm({ value, onChange, fields, newItemTemplate, labelKey }) {
  return (
    <RepeatableList
      items={value}
      onChange={onChange}
      newItemTemplate={newItemTemplate}
      itemLabel={(item) => item[labelKey] || 'New item'}
      renderItem={(item, onItemChange) => (
        <div className="space-y-2">
          {fields.map((f) => {
            if (f.type === 'text') {
              return (
                <input
                  key={f.key}
                  type="text"
                  value={item[f.key] || ''}
                  onChange={(e) => onItemChange({ ...item, [f.key]: e.target.value })}
                  placeholder={f.placeholder || f.label}
                  className={inputClass}
                />
              );
            }
            if (f.type === 'textarea') {
              return (
                <textarea
                  key={f.key}
                  value={item[f.key] || ''}
                  onChange={(e) => onItemChange({ ...item, [f.key]: e.target.value })}
                  placeholder={f.placeholder || f.label}
                  rows={f.rows || 2}
                  className={inputClass}
                />
              );
            }
            if (f.type === 'image') {
              return (
                <ImageField
                  key={f.key}
                  label={f.label}
                  value={item[f.key]}
                  onChange={(v) => onItemChange({ ...item, [f.key]: v })}
                />
              );
            }
            if (f.type === 'document') {
              return (
                <DocumentField
                  key={f.key}
                  label={f.label}
                  value={item[f.key]}
                  onChange={(v) => onItemChange({ ...item, [f.key]: v })}
                />
              );
            }
            if (f.type === 'link') {
              return (
                <div key={f.key}>
                  <label className="mb-1 block font-sans text-xs font-bold text-charcoal/60">{f.label}</label>
                  <LinkField value={item[f.key]} onChange={(v) => onItemChange({ ...item, [f.key]: v })} />
                </div>
              );
            }
            return null;
          })}
        </div>
      )}
    />
  );
}
