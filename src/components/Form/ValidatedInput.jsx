import React from 'react';

const ValidatedInput = ({ 
  label, 
  type = 'text', 
  value, 
  onChange, 
  required = false, 
  pattern,
  inputMode,
  placeholder,
  errorMsg,
  ...props
}) => {
  const [error, setError] = React.useState('');
  const [touched, setTouched] = React.useState(false);

  const validate = (val) => {
    if (required && !val) {
      return 'Este campo es obligatorio';
    }
    if (pattern) {
      const regex = new RegExp(pattern);
      if (val && !regex.test(val)) {
        return errorMsg || 'Formato inválido';
      }
    }
    return '';
  };

  const handleBlur = () => {
    setTouched(true);
    setError(validate(value));
  };

  const handleChange = (e) => {
    const val = e.target.value;
    onChange(val);
    if (touched) {
      setError(validate(val));
    }
  };

  return (
    <div style={{ marginBottom: '1rem', display: 'flex', flexDirection: 'column' }}>
      {label && <label className="form-label" style={{ marginBottom: '0.25rem', fontWeight: 500 }}>
        {label} {required && <span style={{ color: 'red' }}>*</span>}
      </label>}
      <input
        type={type}
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        inputMode={inputMode}
        placeholder={placeholder}
        className={`input-field ${error && touched ? 'error' : ''}`}
        style={{
          padding: '0.75rem',
          border: `1px solid ${error && touched ? '#ef4444' : 'var(--border-strong)'}`,
          borderRadius: '4px',
          outline: 'none',
          transition: 'border-color 0.2s'
        }}
        {...props}
      />
      {error && touched && (
        <span style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.25rem' }}>
          {error}
        </span>
      )}
    </div>
  );
};

export default ValidatedInput;
