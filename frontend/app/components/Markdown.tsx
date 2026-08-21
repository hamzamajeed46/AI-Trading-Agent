import ReactMarkdown from "react-markdown";
import styles from "./Markdown.module.css";

type MarkdownProps = {
  children: string;
};

// Agent output (bull/bear arguments, PM's rationale) is prompted to use
// markdown -- bold for key numbers, short bullet lists -- specifically so it
// reads as scannable points instead of a wall of prose. This is the one
// place that actually renders it; everywhere else was just dumping the raw
// string (which shows literal "**"/"-" characters without a renderer).
export default function Markdown({ children }: MarkdownProps) {
  return (
    <div className={styles.markdown}>
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  );
}
