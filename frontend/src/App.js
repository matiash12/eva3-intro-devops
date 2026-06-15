import React, { useState, useEffect } from 'react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8080';

function App() {
  const [health, setHealth] = useState(null);
  const [students, setStudents] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [healthRes, studentsRes] = await Promise.all([
          fetch(`${BACKEND_URL}/api/health`),
          fetch(`${BACKEND_URL}/api/students`),
        ]);
        setHealth(await healthRes.json());
        setStudents(await studentsRes.json());
      } catch (err) {
        setError('No se pudo conectar con el backend: ' + err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>ISY1101 - Intro DevOps · Eva3</h1>

      <section style={styles.card}>
        <h2 style={styles.sectionTitle}>Estado del Backend</h2>
        {loading && <p style={styles.muted}>Cargando...</p>}
        {error && <p style={styles.error}>{error}</p>}
        {health && (
          <div style={styles.healthBadge}>
            <span style={styles.dot(health.status === 'UP')} />
            <strong>{health.status}</strong> · {health.service} · {health.timestamp}
          </div>
        )}
      </section>

      <section style={styles.card}>
        <h2 style={styles.sectionTitle}>Estudiantes del Curso</h2>
        {students.length > 0 ? (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>ID</th>
                <th style={styles.th}>Nombre</th>
                <th style={styles.th}>Curso</th>
                <th style={styles.th}>Nota</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id} style={styles.tr}>
                  <td style={styles.td}>{s.id}</td>
                  <td style={styles.td}>{s.nombre}</td>
                  <td style={styles.td}>{s.curso}</td>
                  <td style={styles.td}>
                    <span style={styles.notaBadge(s.nota)}>{s.nota}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          !loading && <p style={styles.muted}>Sin datos disponibles.</p>
        )}
      </section>
    </div>
  );
}

const styles = {
  container: { maxWidth: 800, margin: '40px auto', fontFamily: 'system-ui, sans-serif', padding: '0 20px' },
  title: { textAlign: 'center', color: '#1a202c', borderBottom: '3px solid #4299e1', paddingBottom: 12 },
  card: { background: '#fff', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.1)', padding: 24, marginTop: 24 },
  sectionTitle: { marginTop: 0, color: '#2d3748', fontSize: 18 },
  healthBadge: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#4a5568' },
  dot: (up) => ({ width: 12, height: 12, borderRadius: '50%', background: up ? '#48bb78' : '#fc8181', display: 'inline-block' }),
  muted: { color: '#718096', fontStyle: 'italic' },
  error: { color: '#e53e3e', background: '#fff5f5', padding: 12, borderRadius: 6 },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '10px 12px', background: '#edf2f7', color: '#4a5568', fontSize: 13 },
  tr: { borderBottom: '1px solid #e2e8f0' },
  td: { padding: '10px 12px', fontSize: 14, color: '#2d3748' },
  notaBadge: (n) => ({
    display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 13, fontWeight: 'bold',
    background: n >= 6 ? '#c6f6d5' : n >= 5 ? '#fefcbf' : '#fed7d7',
    color: n >= 6 ? '#276749' : n >= 5 ? '#744210' : '#9b2335',
  }),
};

export default App;
