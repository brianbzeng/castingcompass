import unittest

from pipeline.contourcast import deep_model


class DeepModelTests(unittest.TestCase):
    def test_dependency_guard_or_architecture_shapes(self):
        if deep_model.torch is None:
            with self.assertRaisesRegex(RuntimeError, "PyTorch is required"):
                deep_model.architecture_smoke_test()
        else:
            result = deep_model.architecture_smoke_test(batch_size=4, patch_size=17)
            self.assertEqual(result["status"], "architecture_smoke_only")
            self.assertEqual(result["input_shape"], [4, 6, 17, 17])
            self.assertTrue(result["finite_losses"])


if __name__ == "__main__":
    unittest.main()
