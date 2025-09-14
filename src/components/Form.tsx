"use client";

import React, { useState, useRef, useEffect } from "react";

type FieldState = {
  autoFocus?: boolean;
  error?: string;
};

type FormProps = React.FormHTMLAttributes<HTMLFormElement> & {
  children: React.ReactNode;
};

export const Form = ({ children, ...props }: FormProps) => {
  return <form {...props}>{children}</form>;
};

type InputProps = FieldState & React.InputHTMLAttributes<HTMLInputElement> & {
  leadingIcon?: React.ReactNode;
};

export const Input = (props: InputProps) => {
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (props.autoFocus && ref.current) {
      setTimeout(() => {
        ref.current?.focus();
      }, 250);
    }
  }, [props.autoFocus]);

  const { leadingIcon, error, ...inputProps } = props;

  return (
    <div className="flex grow flex-col space-y-2">
      <div
        className={`flex flex-row overflow-hidden rounded-lg border transition-colors bg-root ${
          error
            ? "border-error"
            : focused
            ? "border-highlighted"
            : "border-normal"
        }`}
      >
        {leadingIcon && (
          <div className="flex items-center justify-center pl-3">
            {leadingIcon}
          </div>
        )}
        <input
          ref={ref}
          className={
            `w-full py-4 px-3 text-sm bg-root text-primary focus:outline-none${inputProps.className ?? ""}`
          }
          onFocus={(event) => {
            setFocused(true);
            inputProps.onFocus && inputProps.onFocus(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            inputProps.onBlur && inputProps.onBlur(event);
          }}
          {...inputProps}
        />
      </div>
      {error && <Error text={error} />}
    </div>
  );
};

export const Error = ({ text }: { text: string }) => {
  return <small className="text-xs text-warning">{text}</small>;
};