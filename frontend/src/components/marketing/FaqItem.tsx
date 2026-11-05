import { useState } from 'react';

export function FaqItem({ question, answer, index }: { question: string; answer: string; index: number }) {
  const [open, setOpen] = useState(index === 0);
  const questionId = `landing-question-${index}`;
  const answerId = `landing-answer-${index}`;
  return <div className="ed-question" data-open={open}>
    <h3><button type="button" id={questionId} aria-expanded={open} aria-controls={answerId} onClick={() => setOpen(value => !value)}>
      {question}<span aria-hidden="true">+</span>
    </button></h3>
    <div className="ed-answer" id={answerId} role="region" aria-labelledby={questionId} aria-hidden={!open}>
      <div><p>{answer}</p></div>
    </div>
  </div>;
}
