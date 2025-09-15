import clsx from "clsx";
import { IconButton } from "@/components/hud/Button";
import { ArrowLeftLine, ChevronLeftLine, ChevronRightLine } from "@/icons";
import styles from "./NavHeader.module.css";

type NavHeaderProps = {
  title: string;
  detail: string;
  onBack: () => void;
  onForward: () => void;
};

export const NavHeader = ({ title, detail, onBack, onForward }: NavHeaderProps) => {
  return (
    <div className={clsx(styles.header, "p-1 flex items-center justify-between")}>
      <IconButton
        onClick={onBack}
        icon={<ArrowLeftLine className="stroke-primary"/>}
        className="focus:outline-none hover:bg-action-hover hover:scale-105 transition-all duration-200"
      />
      <div className="flex flex-col items-center">
        <span className={clsx(styles.title)}>{title}</span>
        <span className="text-secondary text-xs">{detail}</span>
      </div>
      <IconButton
        onClick={onForward}
        icon={<ArrowLeftLine className="rotate-180 stroke-primary"/>}
        className="focus:outline-none hover:bg-action-hover hover:scale-105 transition-all duration-200"
      />
    </div>
  );
};