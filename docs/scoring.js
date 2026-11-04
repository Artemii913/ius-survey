(function (root) {
  'use strict';
  function score(answers) {
    if (!Array.isArray(answers) || answers.length !== 27 ||
        Array.from(answers).some(x => !Number.isInteger(x) || x < 1 || x > 5)) {
      throw new Error('Нужны 27 ответов: целые числа от 1 до 5.');
    }
    const total = answers.reduce((a, b) => a + b, 0);
    return { total, max: 135, bandIndex: total <= 62 ? 0 : total <= 98 ? 1 : 2 };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { score };
  else root.SurveyScoring = { score };
})(typeof window !== 'undefined' ? window : this);
