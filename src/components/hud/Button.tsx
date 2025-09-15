import { MouseEventHandler, forwardRef } from "react";

type IconButtonProps = BaseButtonProps & {
  icon: React.ReactNode;
};

type ButtonProps = BaseButtonProps & {
  label: string | React.ReactNode;
  detail?: string;
  icon?: React.ReactNode;
  showLoading?: boolean;
  compact?: boolean;
  type?: 'button' | 'submit' | 'reset';
};

export interface BaseButtonProps {
  style?: ButtonStyle;
  prominence?: ButtonProminence;
  size?: ButtonSize;
  state?: ButtonState;
  disabled?: boolean;
  onClick: MouseEventHandler<HTMLButtonElement>;
  className?: string;
}

export enum ButtonStyle {
  Squared = "square",
  Rounded = "rounded",
  Pill = "pill",
}

export enum ButtonProminence {
  Primary = "primary",
  Secondary = "secondary",
  Tertiary = "tertiary",
}

export enum ButtonSize {
  Small = "small",
  Medium = "medium",
  Large = "large",
}

export enum ButtonState {
  Unselected = "unselected",
  Selected = "selected",
}

const borderStyle = (style: ButtonStyle = ButtonStyle.Rounded) => {
  switch (style) {
    case ButtonStyle.Squared:
      return "rounded-none";
    case ButtonStyle.Rounded:
      return "rounded-lg";
    case ButtonStyle.Pill:
      return "rounded-full";
    default:
      return "rounded-lg";
  }
};

const prominenceStyle = (
  prominence: ButtonProminence = ButtonProminence.Primary,
  disabled: boolean = false
) => {
  switch (prominence) {
    case ButtonProminence.Primary:
      return `bg-action-primary sans-heavy ${
        disabled
          ? "text-tertiary bg-action-primary-disabled"
          : "hover:bg-action-primary-hover active:bg-action-primary-active text-inverted-primary"
      }`;
    case ButtonProminence.Secondary:
      return `bg-elevated sans-heavy ${
        disabled
          ? "text-tertiary"
          : "hover:bg-action-hover active:bg-action-active text-primary"
      }`;
    case ButtonProminence.Tertiary:
      return `bg-transparent sans-heavy ${
        disabled
          ? "text-tertiary"
          : "hover:bg-action-hover active:bg-action-active text-primary"
      }`;
    default:
      return `bg-action-primary sans-heavy ${
        disabled
          ? "text-tertiary"
          : "hover:bg-action-primary-hover active:bg-action-primary-active text-inverted-primary"
      }`;
  }
};

const sizeStyle = (
  size: ButtonSize = ButtonSize.Medium,
  hasLabel: boolean = false
) => {
  switch (size) {
    case ButtonSize.Small:
      return `p-2 ${hasLabel ? "px-3" : ""}`;
    case ButtonSize.Medium:
      return "p-3";
    case ButtonSize.Large:
      return "p-4";
    default:
      return "p-4";
  }
};

export const iconButtonStyleClass = (
  style: ButtonStyle,
  prominence: ButtonProminence,
  size: ButtonSize,
  disabled: boolean
): string => {
  return `${borderStyle(style)} ${prominenceStyle(
    prominence,
    disabled
  )} ${sizeStyle(size)} bg-elevated transition-colors duration-200`;
};

export const buttonStyleClass = (
  style: ButtonStyle,
  prominence: ButtonProminence,
  size: ButtonSize,
  disabled: boolean
): string => {
  return `${borderStyle(style)} ${prominenceStyle(
    prominence,
    disabled
  )} ${sizeStyle(
    size,
    true
  )} transition-colors duration-200 flex font-sans-heavy justify-center`;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      icon,
      style = ButtonStyle.Rounded,
      prominence = ButtonProminence.Secondary,
      size = ButtonSize.Small,
      disabled = false,
      onClick,
      className,
    },
    ref
  ) => {
    return (
      <button
        contentEditable={false}
        className={`${iconButtonStyleClass(
          style,
          prominence,
          size,
          disabled
        )} ${className}`}
        onClick={
          disabled
            ? () => {}
            : (e) => {
                onClick(e);
              }
        }
        disabled={disabled}
        ref={ref}
      >
        {icon}
      </button>
    );
  }
);

IconButton.displayName = "IconButton";

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      label,
      detail,
      icon,
      style = ButtonStyle.Rounded,
      prominence = ButtonProminence.Primary,
      size = ButtonSize.Large,
      disabled = false,
      onClick,
      className,
      compact = true,
      type = 'button',
    },
    ref
  ) => {
    return (
      <button
        contentEditable={false}
        type={type}
        className={`${buttonStyleClass(
          style,
          prominence,
          size,
          disabled
        )} ${className}`}
        onClick={
          disabled
            ? () => {}
            : (e) => {
                onClick(e);
              }
        }
        disabled={disabled}
        ref={ref}
      >
        {icon && <span className={`${compact ? "mr-0 sm:mr-2" : "mr-2"}`}>{icon}</span>}
        <div className={`${(icon && compact) ? "hidden sm:flex" : "flex"} flex-col`}>
          <span className="line-clamp-1">{label}</span>
          {detail ? (
            <span className="line-clamp-1 font-sans-medium text-sm text-secondary">
              {detail}
            </span>
          ) : null}
        </div>
      </button>
    );
  }
);

Button.displayName = "Button";
