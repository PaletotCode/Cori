import { Text, TextInput } from 'react-native';

const applyFontFamily = () => {
  const oldTextRender = (Text as any).render;
  if (oldTextRender) {
    (Text as any).render = function (...args: any[]) {
      const origin = oldTextRender.call(this, ...args);
      return require('react').cloneElement(origin, {
        style: [{ fontFamily: 'Cori' }, origin.props.style],
      });
    };
  }
  
  const oldTextInputRender = (TextInput as any).render;
  if (oldTextInputRender) {
    (TextInput as any).render = function (...args: any[]) {
      const origin = oldTextInputRender.call(this, ...args);
      return require('react').cloneElement(origin, {
        style: [{ fontFamily: 'Cori' }, origin.props.style],
      });
    };
  }
};

applyFontFamily();
