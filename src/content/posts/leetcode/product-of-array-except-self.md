---
title: "[LeetCode] 238. Product of Array Except Self"
date: "2019-07-24"
description: "Product of Array Except Self Link to original Problem on LeetCode Given an array nums of n integers where n > 1, return an array output such that output[i] is equal to the product of all the elements of nums except nums[i]. Example: Input: [1,2,3,4] Output: [24,12,8,6] Note: Please solve it without division and in O(n). Follow up: Could you solve it with constant space complexity? (The output array does not count as extra space for the purpose of space complexity analysis."
categories: ["Programming", "Algorithms", "LeetCode"]
tags: ["Product of Array Except Self", "Array", "LeetCode", "Algorithm"]
draft: false
---

### Product of Array Except Self

[Link to original Problem on LeetCode](https://leetcode.com/problems/product-of-array-except-self/)

Given an array *nums* of *n integers* where *n > 1*, return an array *output* such that *output\[i\]* is equal to the product of all the elements of nums except *nums\[i\]*.

**Example:**

Input: \[1,2,3,4\] Output: \[24,12,8,6\]

**Note:** Please solve it without division and in O(n).

**Follow up:** Could you solve it with constant space complexity? (The output array does not count as extra space for the purpose of space complexity analysis.)

**Company:** *Accolite*, *Amazon*, *D-E-Shaw*, *Morgan Stanley*, *Opera*

**Solution:**

**Time Complexity:** **Space Complexity:**

```python
class Solution(object):
    def productExceptSelf(self, nums):
        """
        :type nums: List[int]
        :rtype: List[int]
        """
        output = [1] * len(nums)
        
        for i in range(1, len(nums)):
            output[i] = output[i - 1] * nums[i - 1]
        
        print output
            
        multiplyThis = nums[-1]
        for i in range(len(nums) - 2, -1, -1):
            output[i] = output[i] * multiplyThis
            multiplyThis *= nums[i]
            
        return output
```
