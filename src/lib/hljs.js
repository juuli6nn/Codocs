/*
 * highlight.js setup. Imports the core library and registers only the languages
 * Codocs supports, which keeps the bundle small. The list of registered languages
 * is mirrored in languages.js for the popup's dropdown.
 */

import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import java from 'highlight.js/lib/languages/java';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import kotlin from 'highlight.js/lib/languages/kotlin';
import swift from 'highlight.js/lib/languages/swift';
import php from 'highlight.js/lib/languages/php';
import ruby from 'highlight.js/lib/languages/ruby';
import dart from 'highlight.js/lib/languages/dart';
import scala from 'highlight.js/lib/languages/scala';
import r from 'highlight.js/lib/languages/r';
import perl from 'highlight.js/lib/languages/perl';
import lua from 'highlight.js/lib/languages/lua';
import objectivec from 'highlight.js/lib/languages/objectivec';
import powershell from 'highlight.js/lib/languages/powershell';
import bash from 'highlight.js/lib/languages/bash';
import groovy from 'highlight.js/lib/languages/groovy';
import haskell from 'highlight.js/lib/languages/haskell';
import sql from 'highlight.js/lib/languages/sql';
import graphql from 'highlight.js/lib/languages/graphql';
import json from 'highlight.js/lib/languages/json';
import yaml from 'highlight.js/lib/languages/yaml';
import ini from 'highlight.js/lib/languages/ini';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import scss from 'highlight.js/lib/languages/scss';
import less from 'highlight.js/lib/languages/less';
import markdown from 'highlight.js/lib/languages/markdown';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import plaintext from 'highlight.js/lib/languages/plaintext';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('java', java);
hljs.registerLanguage('c', c);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('csharp', csharp);
hljs.registerLanguage('go', go);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('kotlin', kotlin);
hljs.registerLanguage('swift', swift);
hljs.registerLanguage('php', php);
hljs.registerLanguage('ruby', ruby);
hljs.registerLanguage('dart', dart);
hljs.registerLanguage('scala', scala);
hljs.registerLanguage('r', r);
hljs.registerLanguage('perl', perl);
hljs.registerLanguage('lua', lua);
hljs.registerLanguage('objectivec', objectivec);
hljs.registerLanguage('powershell', powershell);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('groovy', groovy);
hljs.registerLanguage('haskell', haskell);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('graphql', graphql);
hljs.registerLanguage('json', json);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('ini', ini);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('css', css);
hljs.registerLanguage('scss', scss);
hljs.registerLanguage('less', less);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('dockerfile', dockerfile);
hljs.registerLanguage('plaintext', plaintext);

export default hljs;

export { SUPPORTED_LANGUAGES } from './languages.js';
