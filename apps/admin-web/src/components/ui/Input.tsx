'use client';

import { useState, type InputHTMLAttributes } from 'react';

import styles from './Input.module.css';

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
};

export function Input({ label, name, error, id, type, ...rest }: InputProps) {
  const inputId = id ?? name;
  const errorId = error ? `${inputId}-error` : undefined;

  const isPassword = type === 'password';
  const [passwordVisible, setPasswordVisible] = useState(false);

  return (
    <div className={styles.field}>
      <label htmlFor={inputId} className={styles.label}>
        {label}
      </label>
      <div className={`${styles.inputWrapper} ${error ? styles.inputWrapperError : ''}`}>
        <input
          id={inputId}
          name={name}
          type={isPassword && passwordVisible ? 'text' : type}
          className={styles.input}
          aria-invalid={!!error || undefined}
          aria-describedby={errorId}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            className={styles.toggleButton}
            onClick={() => setPasswordVisible((prev) => !prev)}
            aria-label={passwordVisible ? 'Hide password' : 'Show password'}
            tabIndex={-1}
          >
            {passwordVisible ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        )}
      </div>
      {error && (
        <span id={errorId} className={styles.errorText} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
