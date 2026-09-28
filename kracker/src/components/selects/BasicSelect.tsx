import React, { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import CaretIcon from "../../assets/images/mdi_triangle.svg?react";

export type OptionItem = { value: string; label: string };

interface BasicSelectProps {
    value: string;
    onChange: (v: string) => void;
    options: OptionItem[];
    placeholder?: string;
    // 스타일 토큰 (필요 시 상위에서 조정)
    height?: number;           // 기본 84
    radius?: number;           // 기본 28
    menuMaxHeight?: number;    // 기본 320
    invalid?: boolean;         // 에러상태
    errorId?: string;          // aria-describedby 연결용 ID
}

const Root = styled.div`
  position: relative;
  width: 100%;
`;

const Button = styled.button<{ $open: boolean; $h: number; $r: number; $invalid?: boolean }>`
  width: 100%;
  height: ${({ $h }) => $h}px;
  padding: 0 68px 0 28px;        /* 오른쪽 caret 공간 */
  box-sizing: border-box;
  border: none;
  border-radius: ${({ $r }) => $r}px;
  background: rgba(0,0,0,0.25);
  color: #909090;
  font-size: 24px;
  text-align: left;
  outline: none;
  cursor: pointer;
  appearance: none;
  box-shadow: ${({ $invalid }) =>
        $invalid
            ? "0 0 0 3px rgba(255,71,87,0.3), 0 10px 28px rgba(0,0,0,0.35)" // 에러 red
            : "0 0 0 2px rgba(255,255,255,0.25), 0 10px 28px rgba(0,0,0,0.35)"};
  display: flex;
  align-items: center;
  justify-content: space-between;
  transition: box-shadow .2s ease;

  svg {
    width: 26px;
    height: 26px;
    transform: rotate(${p => (p.$open ? 180 : 0)}deg);
    transition: transform .2s ease, color .2s ease, fill .2s ease;
  }

  svg path, svg polygon, svg rect { fill: currentColor; }

  img {
    width: 26px;
    height: 26px;
    transition: transform .2s ease;
    transform: rotate(${p => (p.$open ? 180 : 0)}deg);
  }

  &:hover,
  &:focus-visible { color: rgba(255,255,255,0.95); }

  &:hover {
       box-shadow: ${({ $invalid }) =>
        $invalid
            ? "0 0 0 3px rgba(255,71,87,0.3), 0 12px 32px rgba(0,0,0,0.45)"
            : "0 0 0 2px rgba(255,255,255,1), 0 12px 32px rgba(0,0,0,0.45)"};
  }
  &:focus-visible {
    box-shadow: ${({ $invalid }) =>
        $invalid
            ? "0 0 0 4px rgba(255,71,87,0.3), 0 12px 36px rgba(0,0,0,0.5)"
            : "0 0 0 3px rgba(255,255,255,1), 0 12px 36px rgba(0,0,0,0.5)"};
  }
`;

const Placeholder = styled.span`
  color: rgba(255,255,255,0.6);
`;

const Dropdown = styled.div<{ $r: number }>`
  position: absolute;
  left: 0;
  top: calc(100% + 8px);
  width: 100%;
  border-radius: ${({ $r }) => Math.max(12, $r - 8)}px;
  overflow: hidden;
  background: rgba(0,0,0,0.9);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  box-shadow:
    0 0 0 2px rgba(255,255,255,0.25),
    0 12px 28px rgba(0,0,0,0.45);
  z-index: 10;
`;

const Options = styled.div<{ $max: number }>`
  max-height: ${({ $max }) => $max}px;
  overflow: auto;
`;

const Row = styled.button<{ $selected?: boolean; $active?: boolean }>`
  width: 100%;
  padding: 18px 24px;
  background: ${({ $selected }) => ($selected ? "rgba(255,255,255,0.12)" : "transparent")};
  color: #fff;
  text-align: left;
  border: none;
  appearance: none;
  cursor: pointer;
  font-size: 22px;

  &:hover {
    background: rgba(255,255,255,0.1);
  }
`;

const BasicSelect: React.FC<BasicSelectProps> = ({
    value,
    onChange,
    options,
    placeholder = "선택하세요",
    invalid,
    errorId,
    height = 84,
    radius = 28,
    menuMaxHeight = 320,
}) => {
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState<number>(() => Math.max(0, options.findIndex(o => o.value === value)));
    const rootRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    // 바깥 클릭으로 닫기
    useEffect(() => {
        const onDoc = (e: MouseEvent) => {
            if (!rootRef.current || rootRef.current.contains(e.target as Node)) return;
            setOpen(false);
        };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, []);

    // 열릴 때 선택 항목으로 활성/스크롤 맞추기
    useEffect(() => {
        if (!open) return;
        const idx = Math.max(0, options.findIndex(o => o.value === value));
        setActive(idx);
        // 활성 항목으로 스크롤
        const el = listRef.current?.querySelector<HTMLButtonElement>(`[data-idx="${idx}"]`);
        if (el) el.scrollIntoView({ block: "nearest" });
    }, [open, options, value]);

    const selectAt = (idx: number) => {
        const item = options[idx];
        if (!item) return;
        onChange(item.value);
        setOpen(false); // ← Enter로 선택 시 즉시 닫힘
    };

    const onKeyDown: React.KeyboardEventHandler<HTMLButtonElement> = (e) => {
        if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === " " || e.key === "Enter")) {
            e.preventDefault();
            setOpen(true);
            return;
        }
        if (!open) return;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive(a => Math.min(options.length - 1, a + 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive(a => Math.max(0, a - 1));
        } else if (e.key === "Enter") {
            e.preventDefault();
            selectAt(active);  // ← 선택 + 닫기
        } else if (e.key === "Escape") {
            e.preventDefault();
            setOpen(false);
        } else if (e.key === "Home") {
            e.preventDefault();
            setActive(0);
        } else if (e.key === "End") {
            e.preventDefault();
            setActive(options.length - 1);
        }
    };

    const label = options.find(o => o.value === value)?.label;

    return (
        <Root ref={rootRef}>
            <Button
                type="button"
                $open={open}
                $h={height}
                $r={radius}
                $invalid={invalid}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-invalid={invalid || undefined}
                aria-describedby={invalid && errorId ? errorId : undefined}
                onClick={() => setOpen(o => !o)}
                onKeyDown={onKeyDown}
            >
                {label ? <span>{label}</span> : <Placeholder>{placeholder}</Placeholder>}
                <CaretIcon aria-hidden="true" focusable="false" />
            </Button>

            {open && (
                <Dropdown role="listbox" $r={radius}>
                    <Options ref={listRef} $max={menuMaxHeight}>
                        {options.map((o, idx) => (
                            <Row
                                key={o.value}
                                role="option"
                                aria-selected={o.value === value}
                                $selected={o.value === value}
                                $active={idx === active}
                                data-idx={idx}
                                onMouseEnter={() => setActive(idx)}
                                onClick={() => selectAt(idx)}
                            >
                                {o.label}
                            </Row>
                        ))}
                    </Options>
                </Dropdown>
            )}
        </Root>
    );
};

export default BasicSelect;