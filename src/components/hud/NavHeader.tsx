import clsx from "clsx";
import { IconButton } from "@/components/hud/Button";
import { ChevronLeftLine, ChevronRightLine } from "@/icons";
import styles from "./NavHeader.module.css";

type NavHeaderProps = {
  title: string;
  onBack: () => void;
  onForward: () => void;
};

export const NavHeader = ({ title, onBack, onForward }: NavHeaderProps) => {
  return (
    <div className={clsx(styles.header, "p-1 sm:p-4 flex items-center justify-between")}>
      <IconButton
        onClick={onBack}
        icon={<ChevronLeftLine />}
      />
      <span className={clsx(styles.title)}>{title}</span>
      <IconButton
        onClick={onForward}
        icon={<ChevronRightLine/>}
      />
    </div>
  );
};