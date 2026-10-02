/* fss-phone — regra ÚNICA de telefone/WhatsApp dos funis FSS (v1, 2026-10-02).
   Fonte canônica: ~/fss-phone/fss-phone.js (gêmeo PHP: fss-phone.php).
   Cada funil leva uma CÓPIA desta função (front e API) — mudou aqui, muda lá.

   fssPhone(raw, cc) → { ok:true, cc, num, full:'+CC NUM', e164 } | { ok:false, error }
   - raw sem "+": Brasil (ou o `cc` do select de país, se vier ≠ 55).
   - raw com "+": internacional; "+55" volta pra regra BR.
   BR: tira 0 e 55 da frente, exige DDD real + celular de 11 dígitos começando com 9,
   recusa número de mentira (88888888, 12345678...). */
var FSS_DDD = '11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99';
var FSS_CC2 = ' 20 27 30 31 32 33 34 36 39 40 41 43 44 45 46 47 48 49 51 52 53 54 55 56 57 58 60 61 62 63 64 65 66 81 82 84 86 90 91 92 93 94 95 98 ';
/* tamanho do número nacional nos países que mais aparecem; resto: 7-12 */
var FSS_LEN = { '1': [10], '351': [9], '34': [9], '33': [9], '39': [9, 10], '44': [10], '49': [10, 11], '41': [9], '353': [9], '54': [10, 11], '52': [10], '56': [9], '57': [10], '51': [9], '595': [9], '598': [8], '591': [8], '244': [9], '258': [9], '61': [9], '81': [9, 10] };

function fssPhone(raw, cc) {
  var s = String(raw == null ? '' : raw).trim();
  var d = s.replace(/\D/g, '');
  var BAD = 'Confira o número: DDD + celular com 9. Ex.: (11) 9XXXX-XXXX';
  if (!d) return { ok: false, error: 'Informe seu WhatsApp com DDD.' };
  if (s.charAt(0) === '+' || (cc && String(cc) !== '55')) {
    if (s.charAt(0) !== '+') d = String(cc).replace(/\D/g, '') + d.replace(/^0+/, '');
    if (d.slice(0, 2) === '55') { s = d.slice(2); d = s; }
    else {
      var c = d.charAt(0) === '1' || d.charAt(0) === '7' ? d.slice(0, 1)
        : FSS_CC2.indexOf(' ' + d.slice(0, 2) + ' ') >= 0 ? d.slice(0, 2) : d.slice(0, 3);
      var n = d.slice(c.length).replace(/^0/, '');
      var lens = FSS_LEN[c];
      var okLen = lens ? lens.indexOf(n.length) >= 0 : n.length >= 7 && n.length <= 12;
      if (!okLen || /^(\d)\1+$/.test(n) || (c === '1' && !/^[2-9]\d\d[2-9]/.test(n))) return { ok: false, error: 'Número internacional inválido. Use +código do país e o número completo.' };
      return { ok: true, cc: c, num: n, full: '+' + c + ' ' + n, e164: '+' + c + n };
    }
  }
  d = d.replace(/^0+/, '');
  if ((d.length === 12 || d.length === 13) && d.slice(0, 2) === '55') d = d.slice(2).replace(/^0+/, '');
  if (d.length === 10 && FSS_DDD.indexOf(d.slice(0, 2)) >= 0 && /^[6-9]/.test(d.charAt(2))) d = d.slice(0, 2) + '9' + d.slice(2);
  if (d.length !== 11) return { ok: false, error: BAD };
  if (FSS_DDD.indexOf(d.slice(0, 2)) < 0 || d.charAt(0) === '0') return { ok: false, error: 'DDD inválido. Confira o código da sua cidade.' };
  if (d.charAt(2) !== '9') return { ok: false, error: 'Use um celular com WhatsApp: depois do DDD ele começa com 9.' };
  var t = d.slice(3);
  if (/^(\d)\1+$/.test(t) || /^(\d)\1{5}/.test(t) || '0123456789012345678'.indexOf(t) >= 0 || '9876543210987654321'.indexOf(t) >= 0)
    return { ok: false, error: 'Esse número não parece real. Digite o seu WhatsApp.' };
  return { ok: true, cc: '55', num: d, full: '+55 ' + d, e164: '+55' + d };
}
if (typeof module !== 'undefined') module.exports = fssPhone;
