import { Button, ErrorBlock, Surface, space, Text } from "@renderer/ui";
import type { DesignReview } from "@shared/design-review";
import type { AppError } from "@shared/result";
import type { JSX } from "react";

export interface DesignReviewPanelProps {
  review: DesignReview | null;
  busy: boolean;
  error: AppError | null;
  onGenerate(): void;
  onSkip(): void;
  onAnswer(questionId: string, optionIds: string[]): void;
  onSuggestion(suggestionId: string, decision: "accepted" | "dismissed"): void;
}

export function DesignReviewPanel(props: DesignReviewPanelProps): JSX.Element {
  if (props.review === null) {
    return (
      <Surface variant="card" padding="md" style={{ gap: space.md }}>
        <Text variant="body">
          設計訪談會提出可核准的玩法建議。這是選用步驟；沒有模型時可以直接繼續。
        </Text>
        {props.error === null ? null : <ErrorBlock error={props.error} />}
        <div style={{ display: "flex", gap: space.sm, flexWrap: "wrap" }}>
          <Button variant="primary" disabled={props.busy} onClick={props.onGenerate}>
            {props.busy ? "正在整理問題…" : "開始設計訪談"}
          </Button>
          <Button variant="ghost" disabled={props.busy} onClick={props.onSkip}>
            略過訪談
          </Button>
        </div>
      </Surface>
    );
  }

  return (
    <div className="g-scroll" style={{ display: "grid", gap: space.md }}>
      {props.review.suggestions.map((suggestion) => (
        <Surface key={suggestion.id} variant="card" padding="md" style={{ gap: space.sm }}>
          <Text variant="label">{suggestion.title}</Text>
          <Text variant="body" tone="dim">
            {suggestion.rationale}
          </Text>
          <div style={{ display: "flex", gap: space.sm }}>
            <Button
              variant="primary"
              disabled={suggestion.status !== "proposed"}
              onClick={() => props.onSuggestion(suggestion.id, "accepted")}
            >
              接受
            </Button>
            <Button
              variant="ghost"
              disabled={suggestion.status !== "proposed"}
              onClick={() => props.onSuggestion(suggestion.id, "dismissed")}
            >
              略過
            </Button>
            {suggestion.status !== "proposed" ? (
              <Text variant="caption">{suggestion.status}</Text>
            ) : null}
          </div>
        </Surface>
      ))}
      {props.review.questions.map((question) => (
        <Surface key={question.id} variant="card" padding="md" style={{ gap: space.sm }}>
          <Text variant="label">{question.question}</Text>
          <div style={{ display: "flex", flexWrap: "wrap", gap: space.sm }}>
            {question.options.map((option) => {
              const selected = props.review?.answers[question.id]?.includes(option.id) ?? false;
              return (
                <Button
                  key={option.id}
                  variant="tile"
                  active={selected}
                  onClick={() => {
                    const current = props.review?.answers[question.id] ?? [];
                    const next = question.multiSelect
                      ? selected
                        ? current.filter((id) => id !== option.id)
                        : [...current, option.id]
                      : [option.id];
                    props.onAnswer(question.id, next);
                  }}
                >
                  <span className="tile-body">
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </span>
                </Button>
              );
            })}
          </div>
        </Surface>
      ))}
      {props.error === null ? null : <ErrorBlock error={props.error} />}
      <Button variant="ghost" disabled={props.busy} onClick={props.onSkip}>
        繼續建立場景
      </Button>
    </div>
  );
}
