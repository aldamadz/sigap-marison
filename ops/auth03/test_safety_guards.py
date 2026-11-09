import ast
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parent
HELPERS = ('smtp-recovery.py', 'auth-mailer-recovery.py', 'mail-delivery-proof.py')


class OperatorSafetyTests(unittest.TestCase):
    def test_optimized_interpreters_refuse_before_operator_work(self):
        for helper in HELPERS:
            for flags, optimization in [(('-O',), None), (('-OO',), None), ((), '1'), ((), '2')]:
                with self.subTest(helper=helper, flags=flags, optimization=optimization):
                    env = {'PATH': os.defpath, 'PYTHONDONTWRITEBYTECODE': '1'}
                    if 'SYSTEMROOT' in os.environ:
                        env['SYSTEMROOT'] = os.environ['SYSTEMROOT']
                    if optimization:
                        env['PYTHONOPTIMIZE'] = optimization
                    arguments = ['staging', 'check'] if helper.startswith('smtp-') else []
                    result = subprocess.run([sys.executable, *flags, '-B', str(ROOT / helper), *arguments],
                                            env=env, input='', capture_output=True, text=True, timeout=5)
                    self.assertNotEqual(result.returncode, 0)
                    self.assertIn('Refusing Python optimisation', result.stderr)
                    self.assertEqual(result.stdout, '')
                    self.assertNotIn('Traceback', result.stderr)

    def test_safety_checks_do_not_use_assert_statements(self):
        for helper in HELPERS:
            with self.subTest(helper=helper):
                tree = ast.parse((ROOT / helper).read_text())
                self.assertFalse(any(isinstance(node, ast.Assert) for node in ast.walk(tree)))
                if helper == 'mail-delivery-proof.py':
                    receive = next(node.value.value for node in tree.body if isinstance(node, ast.Assign)
                                   and any(isinstance(target, ast.Name) and target.id == 'receive' for target in node.targets))
                    self.assertFalse(any(isinstance(node, ast.Assert) for node in ast.walk(ast.parse(receive))))
                guard = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'require')
                scope = {}
                exec(compile(ast.Module(body=[guard], type_ignores=[]), helper, 'exec', optimize=2), scope)
                with self.assertRaisesRegex(RuntimeError, 'fixture safety gate'):
                    scope['require'](False, 'fixture safety gate')

    def test_smtp_arguments_are_checked_before_host_or_secret_access(self):
        tree = ast.parse((ROOT / HELPERS[0]).read_text())
        stop = next(index for index, node in enumerate(tree.body) if isinstance(node, ast.Assign)
                    and any(isinstance(target, ast.Name) and target.id == 'production' for target in node.targets))
        for arguments in [[], ['staging'], ['staging', 'check', 'extra'], ['unknown', 'check'], ['staging', 'unknown']]:
            with self.subTest(arguments=arguments):
                scope = {'sys': type('Sys', (), {'argv': ['helper', *arguments], 'flags': type('Flags', (), {'optimize': 0})()})(),
                         'os': type('Os', (), {'umask': staticmethod(lambda mode: None)})()}
                statements = [node for node in tree.body[:stop] if not isinstance(node, (ast.Import, ast.ImportFrom))]
                with self.assertRaises((RuntimeError, SystemExit)):
                    exec(compile(ast.Module(body=statements, type_ignores=[]), 'fixture', 'exec'), scope)

    def test_configuration_drift_rolls_back_under_optimized_compilation(self):
        tree = ast.parse((ROOT / HELPERS[1]).read_text())
        guard = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'require')
        transaction = next(node for node in tree.body if isinstance(node, ast.Try))
        for drift_after_reload in (False, True):
            with self.subTest(drift_after_reload=drift_after_reload):
                writes, commands = [], []
                original_env = {'GOTRUE_SMTP_PASS': 'old-fixture', 'JWT_SECRET': 'unchanged-fixture'}
                desired_env = {**original_env, 'GOTRUE_SMTP_PASS': 'new-fixture'}
                changed_env = {**desired_env, 'JWT_SECRET': 'unexpected-fixture'}

                def run(args):
                    commands.append(args)
                    if 'config' in args:
                        return json.dumps({'services': {'auth': {'image': 'fixture-image', 'environment': desired_env if drift_after_reload else changed_env}}})
                    if args[:3] == ['docker', 'image', 'inspect']:
                        return json.dumps([{'Id': 'same-image', 'Config': {'Env': []}}])
                    if args[:2] == ['docker', 'inspect']:
                        return json.dumps([{'Image': 'same-image', 'State': {'Health': {'Status': 'healthy'}},
                                            'Config': {'Env': [key + '=' + value for key, value in changed_env.items()]}}])
                    if 'up' in args:
                        return ''
                    self.fail('Unexpected fixture command')

                scope = {'json': json, 'run': run, 'replace_env': writes.append, 'updated': b'after', 'original': b'before',
                         'compose': ['fixture-compose'], 'before': {'Image': 'same-image'}, 'env': original_env,
                         'container': 'fixture-auth', 'password': 'new-fixture', 'reload_started': False}
                with self.assertRaisesRegex(RuntimeError, 'configuration drift'):
                    exec(compile(ast.Module(body=[guard, transaction], type_ignores=[]), 'fixture', 'exec', optimize=2), scope)
                self.assertEqual(writes, [b'after', b'before'])
                self.assertEqual(sum('up' in command for command in commands), 2 if drift_after_reload else 0)


if __name__ == '__main__':
    unittest.main()
