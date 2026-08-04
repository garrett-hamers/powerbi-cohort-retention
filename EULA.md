# End User License Agreement

**Product:** Atlyn Cohort Retention (Power BI custom visual)
**Licensor:** Atlyn ("Atlyn", "we", "us")
**Contact:** <atlyn.help@gmail.com> — https://atlyn.io/contact
**Effective date:** 2025

This End User License Agreement ("Agreement") is a legal agreement between you
(an individual or a single entity, "you") and Atlyn for the Atlyn Cohort
Retention Power BI custom visual, including its object code, associated media,
and documentation (collectively, the "Software").

By installing, importing, or using the Software, you accept this Agreement. If
you do not accept this Agreement, do not install, import, or use the Software.

## 1. Grant of license

The Software is distributed under the MIT License, reproduced in full in the
[`LICENSE`](LICENSE) file of the Software's source repository. Subject to your
compliance with this Agreement, Atlyn grants you a worldwide, royalty-free,
non-exclusive, perpetual license to use, copy, modify, merge, publish,
distribute, sublicense, and sell copies of the Software, subject to the
conditions stated in the MIT License.

Where any term of this Agreement conflicts with the MIT License, the MIT License
governs the grant of rights in the Software.

## 1a. No charge, and no dependency on any subscription

The Software is listed on Microsoft AppSource **free of charge**. There is no
paid or transactable AppSource offer, no in-app purchase, and no licence key.

Atlyn separately operates a paid subscription on the Atlyn storefront at
https://atlyn.io, billed by Stripe under Atlyn's terms of service
(https://atlyn.io/legal/terms). **That subscription is entirely separate from this
Agreement and from the AppSource listing.** No feature of the Software is gated
behind it. The Software performs no licence check, no entitlement lookup, and no
network request of any kind, as stated in section 3.

## 2. Conditions

You must include the MIT License copyright notice and permission notice in all
copies or substantial portions of the Software.

## 3. Data handling and privacy

The Software runs entirely inside the Power BI visual sandbox on the data that
the report author binds to it.

- The Software declares no privileges in `capabilities.json`.
- The Software declares no external JavaScript dependencies and loads no
  external assets.
- The Software makes no network requests. It does not use `fetch`,
  `XMLHttpRequest`, or `WebSocket`, and this is enforced by an automated source
  gate in the Software's build.
- The Software does not collect, transmit, store, or sell your data, and Atlyn
  receives no telemetry from it.

Atlyn's privacy policy is published at https://atlyn.io/legal/privacy and applies
to the Atlyn website and to any support correspondence you send us. It does not
change the fact that the Software itself transmits nothing.

Your use of Power BI remains governed by your agreement with Microsoft.

## 4. Support

Support is provided on a commercially reasonable, best-effort basis through
https://atlyn.io/contact and <atlyn.help@gmail.com>. Atlyn's general terms of
service are published at https://atlyn.io/legal/terms.

## 5. Third-party components

The Software's distributed package contains only first-party code, its
stylesheet, its capabilities and metadata files, its localization resources, and
its icon. It bundles no third-party runtime libraries.

## 6. Disclaimer of warranty

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE, AND NONINFRINGEMENT.

The Software presents cohort retention measurements derived from the data you
supply. You remain responsible for the correctness of that data and for any
business decision you make from the results.

## 7. Limitation of liability

IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES, OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT, OR
OTHERWISE, ARISING FROM, OUT OF, OR IN CONNECTION WITH THE SOFTWARE OR THE USE
OR OTHER DEALINGS IN THE SOFTWARE.

## 8. Term and termination

This Agreement is effective until terminated. It terminates automatically if you
fail to comply with its terms. On termination you must stop using the Software
and remove it from your Power BI reports and tenant.

## 9. Entire agreement

This Agreement, together with the MIT License, is the entire agreement between
you and Atlyn regarding the Software and supersedes any prior understanding on
that subject.
