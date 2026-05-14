import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';
import tsEslint from 'typescript-eslint';

export default [
  {
    ignores: ['dist/**/*']
  },
  ...tsEslint.configs.recommended,
  firebaseRulesPlugin.configs['flat/recommended']
]
