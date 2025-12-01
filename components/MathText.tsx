import { useMemo } from "react";
import "katex/dist/katex.min.css";
import katex from "katex";

interface MathTextProps {
  text: string;
  className?: string;
}

export function MathText({ text, className = "" }: MathTextProps) {
  const processedText = useMemo(() => {
    // Process inline math: $...$
    // Process display math: $$...$$

    let processed = text;
    const parts: { type: "text" | "math"; content: string; display?: boolean }[] = [];

    // First, handle display math ($$...$$)
    const displayMathRegex = /\$\$(.*?)\$\$/gs;
    let lastIndex = 0;
    let match;

    while ((match = displayMathRegex.exec(text)) !== null) {
      // Add text before this math
      if (match.index > lastIndex) {
        const beforeText = text.substring(lastIndex, match.index);
        parts.push({ type: "text", content: beforeText });
      }

      // Add display math
      parts.push({ type: "math", content: match[1], display: true });
      lastIndex = displayMathRegex.lastIndex;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push({ type: "text", content: text.substring(lastIndex) });
    }

    // Now process inline math in text parts
    const finalParts: { type: "text" | "math"; content: string; display?: boolean; html?: string }[] = [];

    for (const part of parts) {
      if (part.type === "math") {
        // Render math
        try {
          const html = katex.renderToString(part.content, {
            displayMode: part.display || false,
            throwOnError: false,
          });
          finalParts.push({ ...part, html });
        } catch (e) {
          // If rendering fails, just show the raw content
          finalParts.push({ type: "text", content: part.display ? `$$${part.content}$$` : `$${part.content}$` });
        }
      } else {
        // Process inline math in this text part
        const inlineMathRegex = /\$(.*?)\$/g;
        let textLastIndex = 0;
        let textMatch;

        while ((textMatch = inlineMathRegex.exec(part.content)) !== null) {
          // Add text before this math
          if (textMatch.index > textLastIndex) {
            finalParts.push({ type: "text", content: part.content.substring(textLastIndex, textMatch.index) });
          }

          // Add inline math
          try {
            const html = katex.renderToString(textMatch[1], {
              displayMode: false,
              throwOnError: false,
            });
            finalParts.push({ type: "math", content: textMatch[1], display: false, html });
          } catch (e) {
            finalParts.push({ type: "text", content: `$${textMatch[1]}$` });
          }

          textLastIndex = inlineMathRegex.lastIndex;
        }

        // Add remaining text
        if (textLastIndex < part.content.length) {
          finalParts.push({ type: "text", content: part.content.substring(textLastIndex) });
        }
      }
    }

    return finalParts;
  }, [text]);

  return (
    <span className={className}>
      {processedText.map((part, idx) => {
        if (part.type === "math" && part.html) {
          return (
            <span
              key={idx}
              dangerouslySetInnerHTML={{ __html: part.html }}
              className={part.display ? "block my-4" : "inline"}
            />
          );
        }
        return <span key={idx}>{part.content}</span>;
      })}
    </span>
  );
}
