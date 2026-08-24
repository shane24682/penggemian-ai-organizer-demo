"use client";

import { useMemo, useState } from "react";
import { calculateMbti, MbtiResult, mbtiQuestions } from "../lib/mbti";
import Icon from "./Icon";

type Props = {
  savedResult: MbtiResult | null;
  onBack: () => void;
  onComplete: (result: MbtiResult) => void;
  onMatch: (result: MbtiResult) => void;
};

export default function MbtiTest({ savedResult, onBack, onComplete, onMatch }: Props) {
  const [answers, setAnswers] = useState<number[]>([]);
  const [step, setStep] = useState(savedResult ? mbtiQuestions.length : 0);
  const result = useMemo(() => step >= mbtiQuestions.length ? (answers.length ? calculateMbti(answers) : savedResult) : null, [answers, savedResult, step]);

  const answer = (index: number) => {
    const next = [...answers];
    next[step] = index;
    setAnswers(next);
    if (step < mbtiQuestions.length - 1) setStep(step + 1);
    else {
      const finalResult = calculateMbti(next);
      setStep(mbtiQuestions.length);
      onComplete(finalResult);
    }
  };

  if (result) return <div className="mbti-result">
    <div className="mbti-result-head"><button onClick={onBack}><Icon name="arrow-left" size="sm"/>测试中心</button><span>MBTI SOCIAL PROFILE</span></div>
    <div className="mbti-type-orb"><b>{result.type}</b><span>{result.title}</span></div>
    <h2>你的活动社交类型是<br/><em>{result.title}</em></h2>
    <p>{result.description}</p>
    <div className="mbti-axis-grid">{result.axes.map(axis => <div key={axis.axis}><span>{axis.left}</span><i><b style={{ left: `${Math.max(6, Math.min(94, 50 + axis.score * 8))}%` }}/></i><span>{axis.right}</span><em>偏向 {axis.letter}</em></div>)}</div>
    <div className="mbti-tags">{result.tags.map(tag => <span key={tag}>#{tag}</span>)}</div>
    <div className="mbti-result-actions"><button onClick={()=>onMatch(result)}>用 MBTI 参与匹配 →</button><button onClick={()=>{setAnswers([]);setStep(0)}}>重新测试</button></div>
    <small>MBTI结果仅用于活动推荐与相处偏好参考，不用于评价能力，也不会直接公开给其他用户。</small>
  </div>;

  const question = mbtiQuestions[step];
  return <div className="mbti-test-shell">
    <div className="mbti-test-top"><button aria-label="返回测试中心" onClick={onBack}><Icon name="arrow-left" size="sm"/></button><div><span>MBTI CAMPUS SOCIAL TEST</span><b>{step + 1}/{mbtiQuestions.length}</b></div></div>
    <div className="mbti-test-progress"><i style={{ width: `${(step + 1) / mbtiQuestions.length * 100}%` }}/></div>
    <div className="mbti-question-card">
      <span>选择更像你的那一面</span>
      <h2>{question.question}</h2>
      <div className="mbti-poles"><b>{question.left}</b><i>或</i><b>{question.right}</b></div>
      <div className="mbti-answers">{question.answers.map((item, index) => <button key={item.label} onClick={()=>answer(index)}><span>{String.fromCharCode(65 + index)}</span>{item.label}<em>→</em></button>)}</div>
      {step > 0 && <button className="mbti-previous" onClick={()=>setStep(step - 1)}><Icon name="arrow-left" size="sm"/>上一题</button>}
    </div>
  </div>;
}
