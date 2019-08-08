const fragmentShader = `
varying vec4 vColor;

void main(void) {
  gl_FragColor = vColor;
}
`;

export default fragmentShader;
