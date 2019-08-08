const vertexShader = `
attribute vec2 aPosition;
attribute float aColorCode;

uniform sampler2D uColorTex;
uniform float uColorTexRes;
uniform mat3 projectionMatrix;
uniform mat3 translationMatrix;

varying vec4 vColor;

void main(void)
{
  // Half a texel (i.e., pixel in texture coordinates)
  float eps = 0.5 / uColorTexRes;
  float colorCode = 5.0;
  float colorRowIndex = floor((aColorCode + eps) / uColorTexRes);

  vec2 colorTexIndex = vec2(
    (aColorCode / uColorTexRes) - colorRowIndex + eps,
    (colorRowIndex / uColorTexRes) + eps
  );
  vColor = texture2D(uColorTex, colorTexIndex);

  gl_Position = vec4(
    (projectionMatrix * translationMatrix * vec3(aPosition, 1.0)).xy,
    0.0,
    1.0
  );
}
`;

export default vertexShader;
